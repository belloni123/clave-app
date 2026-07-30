-- ============================================================================
-- CLAVE - Módulos por projeto, Comunicação por produto e histórico dos chips
-- ============================================================================

-- 1. Permissões de módulos por membro do projeto
alter table public.project_users
  add column if not exists allowed_modules text[] not null default array[
    'concepcao',
    'comunicacao',
    'lancamentos',
    'validacao',
    'historias',
    'financeiro',
    'planejador',
    'urlbuilder',
    'chips',
    'acesso'
  ]::text[];

update public.project_users
set allowed_modules = array[
  'concepcao',
  'comunicacao',
  'lancamentos',
  'validacao',
  'historias',
  'financeiro',
  'planejador',
  'urlbuilder',
  'chips',
  'acesso'
]::text[]
where allowed_modules is null;

alter table public.project_users
  drop constraint if exists project_users_allowed_modules_check;

alter table public.project_users
  add constraint project_users_allowed_modules_check
  check (
    allowed_modules <@ array[
      'concepcao',
      'comunicacao',
      'lancamentos',
      'validacao',
      'historias',
      'financeiro',
      'planejador',
      'urlbuilder',
      'chips',
      'acesso'
    ]::text[]
  );

create or replace function public.user_can_administer_project(proj_id uuid, usr_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles profile
      where profile.id = usr_id
        and profile.role = 'admin'
        and profile.deleted_at is null
    )
    or exists (
      select 1
      from public.profiles profile
      join public.projects project on project.id = proj_id
      where profile.id = usr_id
        and profile.agency_id = project.agency_id
        and profile.agency_role = 'admin'
        and profile.deleted_at is null
    )
    or exists (
      select 1
      from public.projects project
      where project.id = proj_id
        and project.user_id = usr_id
        and project.deleted_at is null
    )
    or exists (
      select 1
      from public.project_users project_user
      where project_user.project_id = proj_id
        and project_user.user_id = usr_id
        and project_user.ativo
        and project_user.permission_level = 'admin'
    );
$$;

create or replace function public.user_has_project_module_access(
  proj_id uuid,
  module_key text,
  usr_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.user_can_administer_project(proj_id, usr_id)
    or exists (
      select 1
      from public.project_users project_user
      where project_user.project_id = proj_id
        and project_user.user_id = usr_id
        and project_user.ativo
        and module_key = any(project_user.allowed_modules)
    );
$$;

revoke all on function public.user_can_administer_project(uuid, uuid) from public;
revoke all on function public.user_has_project_module_access(uuid, text, uuid) from public;
grant execute on function public.user_can_administer_project(uuid, uuid) to authenticated;
grant execute on function public.user_has_project_module_access(uuid, text, uuid) to authenticated;

-- Usuários vinculados também precisam conseguir listar os projetos permitidos.
drop policy if exists "Projetos visíveis por vínculo ativo" on public.projects;
create policy "Projetos visíveis por vínculo ativo"
  on public.projects
  for select
  to authenticated
  using (public.user_has_project_access(id, auth.uid()));

-- A política anterior permitia que qualquer membro alterasse outros acessos.
drop policy if exists "project_users_policy" on public.project_users;
drop policy if exists "project_users_select" on public.project_users;
drop policy if exists "project_users_insert" on public.project_users;
drop policy if exists "project_users_update" on public.project_users;
drop policy if exists "project_users_delete" on public.project_users;

create policy "project_users_select"
  on public.project_users
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.user_can_administer_project(project_id, auth.uid())
  );

create policy "project_users_insert"
  on public.project_users
  for insert
  to authenticated
  with check (public.user_can_administer_project(project_id, auth.uid()));

create policy "project_users_update"
  on public.project_users
  for update
  to authenticated
  using (public.user_can_administer_project(project_id, auth.uid()))
  with check (public.user_can_administer_project(project_id, auth.uid()));

create policy "project_users_delete"
  on public.project_users
  for delete
  to authenticated
  using (public.user_can_administer_project(project_id, auth.uid()));

-- Registra também alterações na lista de módulos.
alter table public.project_access_audit
  add column if not exists modulos_anteriores text[],
  add column if not exists modulos_novos text[];

alter table public.project_access_audit
  drop constraint if exists project_access_audit_acao_check;

alter table public.project_access_audit
  add constraint project_access_audit_acao_check
  check (acao in ('grant', 'revoke', 'update_level', 'update_modules'));

create or replace function public.trg_audit_project_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_access_audit(
      project_id,
      target_user_id,
      actor_id,
      acao,
      nivel_anterior,
      nivel_novo,
      modulos_novos
    )
    values (
      new.project_id,
      new.user_id,
      auth.uid(),
      'grant',
      null,
      new.permission_level,
      new.allowed_modules
    );
  elsif tg_op = 'UPDATE' then
    if old.ativo and not new.ativo then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        auth.uid(),
        'revoke',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    elsif old.permission_level <> new.permission_level then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        auth.uid(),
        'update_level',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    elsif old.allowed_modules is distinct from new.allowed_modules then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        auth.uid(),
        'update_modules',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    end if;
  end if;
  return new;
end;
$$;

-- 2. Comunicação passa a ser organizada por produto/curso
create table if not exists public.communication_products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_communication_products_unique_name
  on public.communication_products(project_id, lower(name))
  where not archived;

create index if not exists idx_communication_products_project
  on public.communication_products(project_id, created_at);

create table if not exists public.communication_product_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.communication_products(id) on delete cascade,
  key text not null,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, key)
);

create index if not exists idx_communication_product_fields_product
  on public.communication_product_fields(product_id);

drop trigger if exists set_updated_at_communication_products on public.communication_products;
create trigger set_updated_at_communication_products
  before update on public.communication_products
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_communication_product_fields on public.communication_product_fields;
create trigger set_updated_at_communication_product_fields
  before update on public.communication_product_fields
  for each row execute function public.handle_updated_at();

create or replace function public.user_has_communication_product_access(
  communication_product_id uuid,
  usr_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_products product
    where product.id = communication_product_id
      and public.user_has_project_module_access(
        product.project_id,
        'comunicacao',
        usr_id
      )
  );
$$;

revoke all on function public.user_has_communication_product_access(uuid, uuid) from public;
grant execute on function public.user_has_communication_product_access(uuid, uuid) to authenticated;

alter table public.communication_products enable row level security;
alter table public.communication_product_fields enable row level security;

drop policy if exists "communication_products_access" on public.communication_products;
create policy "communication_products_access"
  on public.communication_products
  for all
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'comunicacao', auth.uid())
  )
  with check (
    public.user_has_project_module_access(project_id, 'comunicacao', auth.uid())
  );

drop policy if exists "communication_product_fields_access" on public.communication_product_fields;
create policy "communication_product_fields_access"
  on public.communication_product_fields
  for all
  to authenticated
  using (public.user_has_communication_product_access(product_id, auth.uid()))
  with check (public.user_has_communication_product_access(product_id, auth.uid()));

grant select, insert, update, delete on public.communication_products to authenticated;
grant select, insert, update, delete on public.communication_product_fields to authenticated;

-- Preserva os campos antigos em um produto inicial por projeto.
insert into public.communication_products(project_id, name, created_by)
select distinct field.project_id, 'Produto principal', project.user_id
from public.text_fields field
join public.projects project on project.id = field.project_id
where field.key = any(array[
  'id-met',
  'id-qd',
  'id-arg',
  'id-fi',
  'id-bi',
  'id-pi',
  'id-pqe',
  'id-pqne',
  'urgs',
  'objs',
  'faqs',
  'vsl-tt',
  'vsl-copy',
  'pags'
])
and not exists (
  select 1
  from public.communication_products existing
  where existing.project_id = field.project_id
    and lower(existing.name) = lower('Produto principal')
    and not existing.archived
);

insert into public.communication_product_fields(product_id, key, value)
select product.id, field.key, field.value
from public.text_fields field
join public.communication_products product
  on product.project_id = field.project_id
 and lower(product.name) = lower('Produto principal')
 and not product.archived
where field.key = any(array[
  'id-met',
  'id-qd',
  'id-arg',
  'id-fi',
  'id-bi',
  'id-pi',
  'id-pqe',
  'id-pqne',
  'urgs',
  'objs',
  'faqs',
  'vsl-tt',
  'vsl-copy',
  'pags'
])
on conflict(product_id, key) do nothing;

-- 3. Controle de Chips: agenda de recarga e log normalizado
alter table public.chips
  drop constraint if exists chips_status_check;

alter table public.chips
  add constraint chips_status_check
  check (
    status in (
      'Ativo',
      'Ativo sem uso',
      'Bloqueado',
      'Restrição 24h',
      'Quarentena',
      'Perdeu número'
    )
  );

alter table public.chips
  add column if not exists restricao_24h_ate timestamptz,
  add column if not exists proxima_recarga date
    generated always as (ultima_recarga + periodicidade) stored;

create table if not exists public.chip_events (
  id uuid primary key default gen_random_uuid(),
  chip_id uuid not null references public.chips(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'initial_status',
      'status_changed',
      'recharge_recorded',
      'manual_note',
      'legacy_event'
    )
  ),
  previous_status text,
  new_status text,
  note text not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_chip_events_chip_time
  on public.chip_events(chip_id, occurred_at desc);

create index if not exists idx_chip_events_project_time
  on public.chip_events(project_id, occurred_at desc);

-- Importa o JSON legado antes de ativar os triggers automáticos.
insert into public.chip_events(
  chip_id,
  project_id,
  event_type,
  previous_status,
  new_status,
  note,
  occurred_at,
  metadata
)
select
  chip.id,
  chip.project_id,
  'legacy_event',
  null,
  case
    when entry.value->>'evento' in (
      'Ativo',
      'Ativo sem uso',
      'Bloqueado',
      'Restrição 24h',
      'Quarentena',
      'Perdeu número'
    ) then entry.value->>'evento'
    else null
  end,
  coalesce(entry.value->>'obs', 'Evento importado do histórico anterior'),
  case
    when entry.value->>'data' ~ '^\d{4}-\d{2}-\d{2}$'
      then ((entry.value->>'data')::date + time '12:00')
        at time zone 'America/Sao_Paulo'
    when entry.value->>'data' ~ '^\d{4}-\d{2}-\d{2}T'
      then (entry.value->>'data')::timestamptz
    else chip.criado_em + (entry.ordinality || ' seconds')::interval
  end,
  jsonb_build_object(
    'legacy', true,
    'legacy_event_name', entry.value->>'evento'
  )
from public.chips chip
cross join lateral jsonb_array_elements(chip.historico)
  with ordinality as entry(value, ordinality)
where jsonb_typeof(chip.historico) = 'array'
  and not exists (
    select 1
    from public.chip_events existing
    where existing.chip_id = chip.id
      and existing.metadata->>'legacy' = 'true'
  );

create or replace function public.trg_prepare_chip_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Restrição 24h'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    new.restricao_24h_ate := coalesce(new.restricao_24h_ate, now() + interval '24 hours');
  elsif new.status <> 'Restrição 24h' then
    new.restricao_24h_ate := null;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

create or replace function public.trg_log_chip_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chip_events(
      chip_id,
      project_id,
      event_type,
      new_status,
      note,
      actor_id
    )
    values (
      new.id,
      new.project_id,
      'initial_status',
      new.status,
      'Chip cadastrado com status ' || new.status || '.',
      auth.uid()
    );
  else
    if old.status is distinct from new.status then
      insert into public.chip_events(
        chip_id,
        project_id,
        event_type,
        previous_status,
        new_status,
        note,
        actor_id,
        metadata
      )
      values (
        new.id,
        new.project_id,
        'status_changed',
        old.status,
        new.status,
        case
          when new.status = 'Restrição 24h'
            then 'Restrição de 24h ativada. Verificar a liberação após o prazo.'
          when old.status = 'Restrição 24h'
            then 'Restrição de 24h encerrada. Novo status: ' || new.status || '.'
          else 'Status alterado de ' || old.status || ' para ' || new.status || '.'
        end,
        auth.uid(),
        case
          when new.status = 'Restrição 24h'
            then jsonb_build_object('verificar_em', new.restricao_24h_ate)
          else '{}'::jsonb
        end
      );
    end if;

    if old.ultima_recarga is distinct from new.ultima_recarga
      and new.ultima_recarga is not null
    then
      insert into public.chip_events(
        chip_id,
        project_id,
        event_type,
        note,
        actor_id,
        metadata
      )
      values (
        new.id,
        new.project_id,
        'recharge_recorded',
        'Recarga confirmada em ' || to_char(new.ultima_recarga, 'DD/MM/YYYY') || '.',
        auth.uid(),
        jsonb_build_object(
          'ultima_recarga', new.ultima_recarga,
          'proxima_recarga', new.proxima_recarga
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists t_prepare_chip_schedule on public.chips;
create trigger t_prepare_chip_schedule
  before insert or update on public.chips
  for each row execute function public.trg_prepare_chip_schedule();

drop trigger if exists t_log_chip_event on public.chips;
create trigger t_log_chip_event
  after insert or update of status, ultima_recarga on public.chips
  for each row execute function public.trg_log_chip_event();

alter table public.chip_events enable row level security;

drop policy if exists "chip_events_access" on public.chip_events;
create policy "chip_events_access"
  on public.chip_events
  for all
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'chips', auth.uid())
  )
  with check (
    public.user_has_project_module_access(project_id, 'chips', auth.uid())
  );

grant select, insert, update, delete on public.chip_events to authenticated;

-- 4. RLS restritiva: esconder o módulo também protege os dados.
drop policy if exists "module_concepcao_matrix" on public.matrix_answers;
create policy "module_concepcao_matrix"
  on public.matrix_answers as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'concepcao', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'concepcao', auth.uid()));

drop policy if exists "module_concepcao_pricing" on public.pricing_scenarios;
create policy "module_concepcao_pricing"
  on public.pricing_scenarios as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'concepcao', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'concepcao', auth.uid()));

drop policy if exists "module_validacao_ads" on public.ads;
create policy "module_validacao_ads"
  on public.ads as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'validacao', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'validacao', auth.uid()));

drop policy if exists "module_historias_stories" on public.stories;
create policy "module_historias_stories"
  on public.stories as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'historias', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'historias', auth.uid()));

drop policy if exists "module_planejador_calendar" on public.calendar_events;
create policy "module_planejador_calendar"
  on public.calendar_events as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'planejador', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'planejador', auth.uid()));

drop policy if exists "module_lancamentos_checklists" on public.launch_checklists;
create policy "module_lancamentos_checklists"
  on public.launch_checklists as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()));

drop policy if exists "module_financeiro_data" on public.financial_data;
create policy "module_financeiro_data"
  on public.financial_data as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'financeiro', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'financeiro', auth.uid()));

drop policy if exists "module_lancamentos_launches" on public.lancamentos;
create policy "module_lancamentos_launches"
  on public.lancamentos as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()));

drop policy if exists "module_lancamentos_briefings" on public.briefings;
create policy "module_lancamentos_briefings"
  on public.briefings as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()));

drop policy if exists "module_lancamentos_bi_integrations" on public.launch_bi_integrations;
create policy "module_lancamentos_bi_integrations"
  on public.launch_bi_integrations as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()));

drop policy if exists "module_lancamentos_bi_snapshots" on public.launch_bi_snapshots;
create policy "module_lancamentos_bi_snapshots"
  on public.launch_bi_snapshots as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'lancamentos', auth.uid()));

drop policy if exists "module_chips_data" on public.chips;
create policy "module_chips_data"
  on public.chips as restrictive
  for all to authenticated
  using (public.user_has_project_module_access(project_id, 'chips', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'chips', auth.uid()));

create or replace function public.user_has_launch_module_access(
  launch_id uuid,
  usr_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lancamentos launch
    where launch.id = launch_id
      and public.user_has_project_module_access(
        launch.project_id,
        'lancamentos',
        usr_id
      )
  );
$$;

revoke all on function public.user_has_launch_module_access(uuid, uuid) from public;
grant execute on function public.user_has_launch_module_access(uuid, uuid) to authenticated;

drop policy if exists "module_lancamentos_schedule" on public.lancamentos_cronograma;
create policy "module_lancamentos_schedule"
  on public.lancamentos_cronograma as restrictive
  for all to authenticated
  using (public.user_has_launch_module_access(lancamento_id, auth.uid()))
  with check (public.user_has_launch_module_access(lancamento_id, auth.uid()));

drop policy if exists "module_lancamentos_forecast" on public.lancamentos_provisionamento;
create policy "module_lancamentos_forecast"
  on public.lancamentos_provisionamento as restrictive
  for all to authenticated
  using (public.user_has_launch_module_access(lancamento_id, auth.uid()))
  with check (public.user_has_launch_module_access(lancamento_id, auth.uid()));

drop policy if exists "module_lancamentos_actual" on public.lancamentos_realizado;
create policy "module_lancamentos_actual"
  on public.lancamentos_realizado as restrictive
  for all to authenticated
  using (public.user_has_launch_module_access(lancamento_id, auth.uid()))
  with check (public.user_has_launch_module_access(lancamento_id, auth.uid()));

drop policy if exists "module_lancamentos_investments" on public.lancamentos_investimentos;
create policy "module_lancamentos_investments"
  on public.lancamentos_investimentos as restrictive
  for all to authenticated
  using (public.user_has_launch_module_access(lancamento_id, auth.uid()))
  with check (public.user_has_launch_module_access(lancamento_id, auth.uid()));

drop policy if exists "module_text_fields" on public.text_fields;
create policy "module_text_fields"
  on public.text_fields as restrictive
  for all to authenticated
  using (
    case
      when key = any(array[
        'id-met',
        'id-qd',
        'id-arg',
        'id-fi',
        'id-bi',
        'id-pi',
        'id-pqe',
        'id-pqne',
        'urgs',
        'objs',
        'faqs',
        'vsl-tt',
        'vsl-copy',
        'pags'
      ])
        then public.user_has_project_module_access(project_id, 'comunicacao', auth.uid())
      when key = 'url_history'
        then public.user_has_project_module_access(project_id, 'urlbuilder', auth.uid())
      when key = 'services-pricing'
        then public.user_has_project_module_access(project_id, 'financeiro', auth.uid())
      when key = 'benchmarking'
        then (
          public.user_has_project_module_access(project_id, 'concepcao', auth.uid())
          or public.user_has_project_module_access(project_id, 'financeiro', auth.uid())
        )
      when key = any(array['networking_contacts', 'sub_projects'])
        then public.user_has_project_module_access(project_id, 'acesso', auth.uid())
      else public.user_has_project_access(project_id, auth.uid())
    end
  )
  with check (
    case
      when key = any(array[
        'id-met',
        'id-qd',
        'id-arg',
        'id-fi',
        'id-bi',
        'id-pi',
        'id-pqe',
        'id-pqne',
        'urgs',
        'objs',
        'faqs',
        'vsl-tt',
        'vsl-copy',
        'pags'
      ])
        then public.user_has_project_module_access(project_id, 'comunicacao', auth.uid())
      when key = 'url_history'
        then public.user_has_project_module_access(project_id, 'urlbuilder', auth.uid())
      when key = 'services-pricing'
        then public.user_has_project_module_access(project_id, 'financeiro', auth.uid())
      when key = 'benchmarking'
        then (
          public.user_has_project_module_access(project_id, 'concepcao', auth.uid())
          or public.user_has_project_module_access(project_id, 'financeiro', auth.uid())
        )
      when key = any(array['networking_contacts', 'sub_projects'])
        then public.user_has_project_module_access(project_id, 'acesso', auth.uid())
      else public.user_has_project_access(project_id, auth.uid())
    end
  );
