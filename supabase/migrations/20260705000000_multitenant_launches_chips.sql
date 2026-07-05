-- ============================================================================
-- CLAVE — Migração: Multi-Tenant, Módulo de Lançamentos e Controle de Chips
-- Versão 1.0 — Julho de 2026
-- ============================================================================

-- 1. AGÊNCIAS
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  criado_em   timestamptz not null default now()
);

-- Insere uma agência padrão para migração de dados existentes
insert into public.agencies (id, nome)
values ('00000000-0000-0000-0000-000000000000', 'Agência Principal')
on conflict (id) do nothing;

-- 2. AJUSTAR PROFILES
alter table public.profiles
  add column if not exists agency_id uuid references public.agencies(id) on delete restrict default '00000000-0000-0000-0000-000000000000',
  add column if not exists agency_role text check (agency_role in ('admin', 'gestor', 'colaborador')) default 'colaborador';

-- Vincula todos os profiles existentes à agência principal e define role
update public.profiles
set agency_id = '00000000-0000-0000-0000-000000000000'
where agency_id is null;

update public.profiles
set agency_role = 'admin'
where role = 'admin';

-- 3. AJUSTAR PROJECTS
alter table public.projects
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade default '00000000-0000-0000-0000-000000000000';

update public.projects
set agency_id = '00000000-0000-0000-0000-000000000000'
where agency_id is null;

-- 4. ACESSO A PROJETOS (PROJECT USERS)
create table if not exists public.project_users (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  permission_level  text not null check (permission_level in ('viewer', 'editor', 'admin')) default 'viewer',
  ativo             boolean not null default true,
  concedido_por     uuid references public.profiles(id),
  criado_em         timestamptz not null default now(),
  revogado_em       timestamptz,
  unique (project_id, user_id)
);

create index if not exists idx_project_users_project on public.project_users(project_id) where ativo;
create index if not exists idx_project_users_user    on public.project_users(user_id) where ativo;

-- Migra donos de projetos existentes como administradores do projeto
insert into public.project_users (project_id, user_id, permission_level, concedido_por)
select id, user_id, 'admin', user_id
from public.projects
on conflict (project_id, user_id) do nothing;

-- Migra colaboradores existentes (colab_assignments) como editores do projeto
insert into public.project_users (project_id, user_id, permission_level, concedido_por)
select project_id, colab_id, 'editor', (select user_id from public.projects where id = project_id limit 1)
from public.colab_assignments
on conflict (project_id, user_id) do nothing;

-- Trigger para garantir que usuário e projeto pertençam à mesma agência
create or replace function public.trg_check_same_agency() returns trigger
language plpgsql as $$
declare
  v_agency_projeto uuid;
  v_agency_user    uuid;
begin
  select agency_id into v_agency_projeto from public.projects where id = new.project_id;
  select agency_id into v_agency_user    from public.profiles where id = new.user_id;
  if v_agency_projeto is not null and v_agency_user is not null and v_agency_projeto <> v_agency_user then
    raise exception 'Usuário e projeto precisam pertencer à mesma agência (multi-tenancy).';
  end if;
  return new;
end;
$$;

drop trigger if exists t_check_same_agency on public.project_users;
create trigger t_check_same_agency
  before insert or update on public.project_users
  for each row execute function public.trg_check_same_agency();

-- 5. AUDITORIA DE ACESSOS DE PROJETO
create table if not exists public.project_access_audit (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  target_user_id  uuid not null references public.profiles(id),
  actor_id        uuid,
  acao            text not null check (acao in ('grant', 'revoke', 'update_level')),
  nivel_anterior  text check (nivel_anterior in ('viewer', 'editor', 'admin')),
  nivel_novo      text check (nivel_novo in ('viewer', 'editor', 'admin')),
  criado_em       timestamptz not null default now()
);

create index if not exists idx_access_audit_project on public.project_access_audit(project_id);

create or replace function public.trg_audit_project_access() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_access_audit(project_id, target_user_id, actor_id, acao, nivel_anterior, nivel_novo)
    values (new.project_id, new.user_id, auth.uid(), 'grant', null, new.permission_level);
  elsif tg_op = 'UPDATE' then
    if old.ativo and not new.ativo then
      insert into public.project_access_audit(project_id, target_user_id, actor_id, acao, nivel_anterior, nivel_novo)
      values (new.project_id, new.user_id, auth.uid(), 'revoke', old.permission_level, new.permission_level);
    elsif old.permission_level <> new.permission_level then
      insert into public.project_access_audit(project_id, target_user_id, actor_id, acao, nivel_anterior, nivel_novo)
      values (new.project_id, new.user_id, auth.uid(), 'update_level', old.permission_level, new.permission_level);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists t_audit_project_access on public.project_users;
create trigger t_audit_project_access
  after insert or update on public.project_users
  for each row execute function public.trg_audit_project_access();

-- 6. LANÇAMENTOS
create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  nome            text not null,
  template        text not null check (template in ('lancamento', 'evento_pago', 'pico_perpetuo')),
  criado_por      uuid not null references public.profiles(id),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.profiles(id),
  atualizado_em   timestamptz
);

create index if not exists idx_lancamentos_project on public.lancamentos(project_id);

-- 7. BRIEFINGS
create table if not exists public.briefings (
  id              uuid primary key default gen_random_uuid(),
  lancamento_id   uuid not null references public.lancamentos(id) on delete cascade,
  project_id      uuid not null references public.projects(id),
  versao          int not null default 1,
  is_atual        boolean not null default true,
  mote            text,
  oferta          jsonb,
  publico_alvo    text,
  datas           jsonb,
  materiais_apoio jsonb,
  criado_por      uuid not null references public.profiles(id),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.profiles(id),
  atualizado_em   timestamptz
);

create index if not exists idx_briefings_lancamento on public.briefings(lancamento_id);
create index if not exists idx_briefings_project    on public.briefings(project_id);

-- Trigger de sincronização de project_id no briefing
create or replace function public.trg_sync_briefing_project() returns trigger
language plpgsql as $$
begin
  select project_id into new.project_id from public.lancamentos where id = new.lancamento_id;
  return new;
end;
$$;

drop trigger if exists t_sync_briefing_project on public.briefings;
create trigger t_sync_briefing_project
  before insert or update of lancamento_id on public.briefings
  for each row execute function public.trg_sync_briefing_project();

-- Trigger de auditoria do briefing
create or replace function public.trg_set_briefing_audit() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
  elsif tg_op = 'UPDATE' then
    new.atualizado_por := auth.uid();
    new.atualizado_em  := now();
  end if;
  return new;
end;
$$;

drop trigger if exists t_set_briefing_audit on public.briefings;
create trigger t_set_briefing_audit
  before insert or update on public.briefings
  for each row execute function public.trg_set_briefing_audit();

-- 8. TABELAS FILHAS DO LANÇAMENTO
-- Cronograma
create table if not exists public.lancamentos_cronograma (
  lancamento_id         uuid primary key references public.lancamentos(id) on delete cascade,
  verba_total           numeric(12,2) not null default 0,
  data_ancora           date not null,
  qtd_cpls              integer not null default 3,
  verba_perpetuo_diaria numeric(12,2) not null default 0,
  etapas                jsonb not null default '[]'::jsonb,
  prazos_equipe         jsonb not null default '[]'::jsonb,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Provisionamento
create table if not exists public.lancamentos_provisionamento (
  lancamento_id         uuid primary key references public.lancamentos(id) on delete cascade,
  cenario_ativo         text not null default 'Médio',
  dados                 jsonb not null default '{}'::jsonb,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Realizado
create table if not exists public.lancamentos_realizado (
  lancamento_id         uuid primary key references public.lancamentos(id) on delete cascade,
  dados                 jsonb not null default '{}'::jsonb,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Investimentos X Resultados
create table if not exists public.lancamentos_investimentos (
  lancamento_id         uuid primary key references public.lancamentos(id) on delete cascade,
  dados                 jsonb not null default '{}'::jsonb,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- 9. TABELA DE CHIPS (SIM CARDS)
create table if not exists public.chips (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  id_chip         integer,
  numero          text not null,
  operadora       text not null,
  funcao          text,
  responsavel     text,
  status          text not null check (status in ('Ativo', 'Ativo sem uso', 'Bloqueado', 'Quarentena', 'Perdeu número')) default 'Ativo',
  arquivado       boolean not null default false,
  ultima_recarga  date,
  periodicidade   integer not null default 60,
  valor           numeric(12,2),
  senha_whatsapp  text,
  senha_app       text,
  aparelho        text,
  obs             text,
  historico       jsonb not null default '[]'::jsonb,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_chips_project on public.chips(project_id);

-- ============================================================================
-- 10. REESCREVER FUNÇÃO DE ACESSO DE PROJETO E RLS
-- ============================================================================
create or replace function public.user_has_project_access(proj_id uuid, usr_id uuid)
returns boolean as $$
declare
  v_agency_projeto  uuid;
  v_is_agency_admin boolean;
begin
  -- 1) Se for Admin geral do sistema, libera acesso
  if exists (select 1 from public.profiles where id = usr_id and role = 'admin') then
    return true;
  end if;

  -- 2) Se for Admin da agência correspondente ao projeto, libera acesso
  select agency_id into v_agency_projeto from public.projects where id = proj_id;
  if v_agency_projeto is not null then
    select exists(
      select 1 from public.profiles
      where id = usr_id
        and agency_id = v_agency_projeto
        and agency_role = 'admin'
        and ativo
    ) into v_is_agency_admin;
    if v_is_agency_admin then
      return true;
    end if;
  end if;

  -- 3) Se for o dono direto do projeto
  if exists (select 1 from public.projects where id = proj_id and user_id = usr_id) then
    return true;
  end if;

  -- 4) Se tiver entrada ativa na tabela project_users para este projeto
  return exists (
    select 1 from public.project_users
    where project_id = proj_id and user_id = usr_id and ativo
  );
end;
$$ language plpgsql security definer;

-- Habilitar RLS em todas as tabelas
alter table public.agencies enable row level security;
alter table public.project_users enable row level security;
alter table public.project_access_audit enable row level security;
alter table public.lancamentos enable row level security;
alter table public.briefings enable row level security;
alter table public.lancamentos_cronograma enable row level security;
alter table public.lancamentos_provisionamento enable row level security;
alter table public.lancamentos_realizado enable row level security;
alter table public.lancamentos_investimentos enable row level security;
alter table public.chips enable row level security;

-- Configurar Políticas
drop policy if exists "agencies_select_policy" on public.agencies;
create policy "agencies_select_policy" on public.agencies
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.agency_id = agencies.id
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "project_users_policy" on public.project_users;
create policy "project_users_policy" on public.project_users
  for all using (public.user_has_project_access(project_id, auth.uid()));

drop policy if exists "project_access_audit_policy" on public.project_access_audit;
create policy "project_access_audit_select" on public.project_access_audit
  for select using (public.user_has_project_access(project_id, auth.uid()));

drop policy if exists "lancamentos_policy" on public.lancamentos;
create policy "lancamentos_policy" on public.lancamentos
  for all using (public.user_has_project_access(project_id, auth.uid()));

drop policy if exists "briefings_policy" on public.briefings;
create policy "briefings_policy" on public.briefings
  for all using (public.user_has_project_access(project_id, auth.uid()));

drop policy if exists "cronograma_policy" on public.lancamentos_cronograma;
create policy "cronograma_policy" on public.lancamentos_cronograma
  for all using (exists (select 1 from public.lancamentos l where l.id = lancamento_id and public.user_has_project_access(l.project_id, auth.uid())));

drop policy if exists "provisionamento_policy" on public.lancamentos_provisionamento;
create policy "provisionamento_policy" on public.lancamentos_provisionamento
  for all using (exists (select 1 from public.lancamentos l where l.id = lancamento_id and public.user_has_project_access(l.project_id, auth.uid())));

drop policy if exists "realizado_policy" on public.lancamentos_realizado;
create policy "realizado_policy" on public.lancamentos_realizado
  for all using (exists (select 1 from public.lancamentos l where l.id = lancamento_id and public.user_has_project_access(l.project_id, auth.uid())));

drop policy if exists "investimentos_policy" on public.lancamentos_investimentos;
create policy "investimentos_policy" on public.lancamentos_investimentos
  for all using (exists (select 1 from public.lancamentos l where l.id = lancamento_id and public.user_has_project_access(l.project_id, auth.uid())));

drop policy if exists "chips_policy" on public.chips;
create policy "chips_policy" on public.chips
  for all using (public.user_has_project_access(project_id, auth.uid()));
