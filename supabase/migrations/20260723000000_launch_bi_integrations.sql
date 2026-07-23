-- ==========================================================================
-- CLAVE - Fontes de BI e historico de sincronizacao dos lancamentos
-- ==========================================================================

create table if not exists public.launch_bi_integrations (
  id                    uuid primary key default gen_random_uuid(),
  lancamento_id         uuid not null unique references public.lancamentos(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  provider              text not null default 'b16_dashboard'
                        check (provider in ('b16_dashboard')),
  dashboard_url         text not null check (dashboard_url ~ '^https://'),
  external_launch_code  text not null check (external_launch_code ~ '^[A-Za-z0-9_-]{2,32}$'),
  period_start          date not null,
  period_end            date,
  status                text not null default 'connected'
                        check (status in ('connected', 'error')),
  last_synced_at        timestamptz,
  last_error            text,
  last_snapshot         jsonb,
  criado_por            uuid not null references public.profiles(id),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  check (period_end is null or period_end >= period_start)
);

create index if not exists idx_launch_bi_integrations_project
  on public.launch_bi_integrations(project_id);

create table if not exists public.launch_bi_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  integration_id        uuid not null references public.launch_bi_integrations(id) on delete cascade,
  lancamento_id         uuid not null references public.lancamentos(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  metrics               jsonb not null,
  source_updated_at     text,
  synced_by             uuid not null references public.profiles(id),
  synced_at             timestamptz not null default now()
);

create index if not exists idx_launch_bi_snapshots_launch_synced
  on public.launch_bi_snapshots(lancamento_id, synced_at desc);

alter table public.launch_bi_integrations enable row level security;
alter table public.launch_bi_snapshots enable row level security;

drop policy if exists "launch_bi_integrations_policy" on public.launch_bi_integrations;
create policy "launch_bi_integrations_policy" on public.launch_bi_integrations
  for all
  using (public.user_has_project_access(project_id, auth.uid()))
  with check (public.user_has_project_access(project_id, auth.uid()));

drop policy if exists "launch_bi_snapshots_policy" on public.launch_bi_snapshots;
create policy "launch_bi_snapshots_policy" on public.launch_bi_snapshots
  for all
  using (public.user_has_project_access(project_id, auth.uid()))
  with check (public.user_has_project_access(project_id, auth.uid()));
