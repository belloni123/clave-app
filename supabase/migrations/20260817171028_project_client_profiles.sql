-- ============================================================================
-- CLAVE - Perfil do cliente e comparativo de evolucao por projeto
-- ============================================================================

alter table public.project_users
  alter column allowed_modules set default array[
    'cliente',
    'concepcao',
    'comunicacao',
    'lancamentos',
    'validacao',
    'historias',
    'financeiro',
    'planejador',
    'urlbuilder',
    'chips',
    'formularios',
    'acesso'
  ]::text[];

alter table public.project_users
  drop constraint if exists project_users_allowed_modules_check;

alter table public.project_users
  add constraint project_users_allowed_modules_check
  check (
    allowed_modules <@ array[
      'cliente',
      'concepcao',
      'comunicacao',
      'lancamentos',
      'validacao',
      'historias',
      'financeiro',
      'planejador',
      'urlbuilder',
      'chips',
      'formularios',
      'acesso'
    ]::text[]
  );

create table public.project_client_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  contract_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(contract_profile) = 'object'),
  baseline_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(baseline_snapshot) = 'object'),
  current_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(current_snapshot) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_project_client_profiles
  before update on public.project_client_profiles
  for each row execute function public.handle_updated_at();

alter table public.project_client_profiles enable row level security;

revoke all on public.project_client_profiles from public, anon, authenticated;
grant select, insert, update on public.project_client_profiles to authenticated;

create policy project_client_profiles_select
  on public.project_client_profiles
  for select
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'cliente',
      (select auth.uid())
    )
  );

create policy project_client_profiles_insert
  on public.project_client_profiles
  for insert
  to authenticated
  with check (
    public.user_has_project_module_access(
      project_id,
      'cliente',
      (select auth.uid())
    )
    and updated_by = (select auth.uid())
  );

create policy project_client_profiles_update
  on public.project_client_profiles
  for update
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'cliente',
      (select auth.uid())
    )
  )
  with check (
    public.user_has_project_module_access(
      project_id,
      'cliente',
      (select auth.uid())
    )
    and updated_by = (select auth.uid())
  );

insert into public.project_client_profiles(project_id)
select project.id
from public.projects project
where project.deleted_at is null
on conflict(project_id) do nothing;

update public.project_forms
set version = greatest(version, 2)
where kind = 'client_briefing';

comment on table public.project_client_profiles is
  'Perfil contratual e snapshots de entrada e atual do cliente, isolados por projeto.';
comment on column public.project_client_profiles.baseline_snapshot is
  'Marco zero preservado para comparacao com a evolucao acompanhada pela B16.';
comment on column public.project_client_profiles.current_snapshot is
  'Retrato atual editavel do cliente, sem duplicar o historico de lancamentos.';
