-- ============================================================================
-- CLAVE - Instagram Analytics por projeto
-- ============================================================================

-- 1. Disponibiliza o novo módulo nas permissões existentes.
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
    'instagram',
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
      'instagram',
      'acesso'
    ]::text[]
  );

update public.project_users
set allowed_modules = array_append(allowed_modules, 'instagram')
where not ('instagram' = any(allowed_modules));

-- 2. Uma conexão por projeto. O token permanece exclusivamente no Vault.
create table public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  name text,
  account_type text,
  profile_picture_url text,
  followers_count integer,
  media_count integer,
  token_secret_id uuid,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}'::text[],
  status text not null default 'connected'
    check (status in ('connected', 'syncing', 'error', 'expired')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index instagram_connections_user_idx
  on public.instagram_connections(instagram_user_id);

create table public.instagram_account_daily (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  metric_date date not null,
  followers_count integer,
  follows integer,
  unfollows integer,
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
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, metric_date)
);

create index instagram_account_daily_project_date_idx
  on public.instagram_account_daily(project_id, metric_date desc);

create table public.instagram_media (
  id text primary key,
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  caption text,
  media_type text,
  media_product_type text,
  media_url text,
  thumbnail_url text,
  permalink text,
  posted_at timestamptz not null,
  like_count integer,
  comments_count integer,
  is_story boolean not null default false,
  raw_media jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index instagram_media_project_posted_idx
  on public.instagram_media(project_id, posted_at desc);

create table public.instagram_media_insights (
  id uuid primary key default gen_random_uuid(),
  media_id text not null references public.instagram_media(id) on delete cascade,
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  collected_on date not null,
  views bigint,
  reach bigint,
  plays bigint,
  total_interactions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  replies bigint,
  average_watch_time_ms bigint,
  total_watch_time_ms bigint,
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(media_id, collected_on)
);

create index instagram_media_insights_project_date_idx
  on public.instagram_media_insights(project_id, collected_on desc);

create table public.instagram_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  trigger_source text not null check (trigger_source in ('oauth', 'manual', 'cron')),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  account_days_synced integer not null default 0,
  media_synced integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb
);

create index instagram_sync_runs_project_started_idx
  on public.instagram_sync_runs(project_id, started_at desc);

-- 3. Atualização uniforme dos metadados.
create trigger set_instagram_connections_updated_at
before update on public.instagram_connections
for each row execute function public.handle_updated_at();

create trigger set_instagram_account_daily_updated_at
before update on public.instagram_account_daily
for each row execute function public.handle_updated_at();

create trigger set_instagram_media_updated_at
before update on public.instagram_media
for each row execute function public.handle_updated_at();

create trigger set_instagram_media_insights_updated_at
before update on public.instagram_media_insights
for each row execute function public.handle_updated_at();

-- 4. As tabelas são server-only. RLS continua habilitado como defesa em profundidade.
alter table public.instagram_connections enable row level security;
alter table public.instagram_account_daily enable row level security;
alter table public.instagram_media enable row level security;
alter table public.instagram_media_insights enable row level security;
alter table public.instagram_sync_runs enable row level security;

revoke all on table public.instagram_connections from public, anon, authenticated;
revoke all on table public.instagram_account_daily from public, anon, authenticated;
revoke all on table public.instagram_media from public, anon, authenticated;
revoke all on table public.instagram_media_insights from public, anon, authenticated;
revoke all on table public.instagram_sync_runs from public, anon, authenticated;

grant select, insert, update, delete on table public.instagram_connections to service_role;
grant select, insert, update, delete on table public.instagram_account_daily to service_role;
grant select, insert, update, delete on table public.instagram_media to service_role;
grant select, insert, update, delete on table public.instagram_media_insights to service_role;
grant select, insert, update, delete on table public.instagram_sync_runs to service_role;

-- 5. Ponte mínima e privada para o Supabase Vault.
create or replace function public.set_instagram_token(
  p_secret_id uuid,
  p_token_value text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_name text;
  v_description text;
begin
  if p_token_value is null or length(p_token_value) = 0 then
    raise exception 'Instagram token cannot be empty';
  end if;

  if p_secret_id is null then
    v_secret_id := vault.create_secret(
      p_token_value,
      'clave_instagram_token_' || gen_random_uuid()::text,
      'Clave Instagram long-lived access token',
      null
    );
  else
    select name, description
      into v_name, v_description
      from vault.decrypted_secrets
     where id = p_secret_id;

    if v_name is null then
      raise exception 'Instagram token secret not found';
    end if;

    perform vault.update_secret(
      p_secret_id,
      p_token_value,
      v_name,
      v_description,
      null
    );
    v_secret_id := p_secret_id;
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.get_instagram_token(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where id = p_secret_id;
$$;

create or replace function public.delete_instagram_token(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if p_secret_id is not null then
    delete from vault.secrets where id = p_secret_id;
  end if;
end;
$$;

revoke all on function public.set_instagram_token(uuid, text) from public, anon, authenticated;
revoke all on function public.get_instagram_token(uuid) from public, anon, authenticated;
revoke all on function public.delete_instagram_token(uuid) from public, anon, authenticated;
grant execute on function public.set_instagram_token(uuid, text) to service_role;
grant execute on function public.get_instagram_token(uuid) to service_role;
grant execute on function public.delete_instagram_token(uuid) to service_role;

comment on table public.instagram_connections is
  'One Instagram professional account connection per project. Access token lives in Supabase Vault.';
