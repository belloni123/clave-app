-- Totais oficiais por janela. Alcance nao deve ser calculado somando uniques diarios.
create table public.instagram_account_period_totals (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  window_days smallint not null check (window_days in (7, 30, 90)),
  window_kind text not null check (window_kind in ('current', 'previous')),
  period_start date not null,
  period_end date not null,
  reach bigint,
  views bigint,
  profile_views bigint,
  profile_links_taps bigint,
  accounts_engaged bigint,
  total_interactions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  replies bigint,
  follows bigint,
  unfollows bigint,
  raw_metrics jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, window_days, window_kind),
  check (period_end >= period_start),
  check (window_days <> 90 or window_kind = 'current')
);

create index instagram_account_period_totals_project_window_idx
  on public.instagram_account_period_totals(project_id, window_days, window_kind);

create trigger set_instagram_account_period_totals_updated_at
before update on public.instagram_account_period_totals
for each row execute function public.handle_updated_at();

alter table public.instagram_account_period_totals enable row level security;

revoke all on table public.instagram_account_period_totals from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_account_period_totals to service_role;
