-- ============================================================================
-- CLAVE - Publicacao e agendamento Meta por projeto
-- Migration aditiva. Nao altera nem remove estruturas do Instagram Analytics.
-- ============================================================================

create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  source_connection_id uuid references public.instagram_connections(id) on delete set null,
  external_identity_id text,
  display_name text,
  token_secret_id uuid,
  refresh_token_secret_id uuid,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}'::text[],
  status text not null default 'connected'
    check (status in ('connected', 'reauthorization_required', 'expired', 'error', 'disconnected')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, provider),
  unique(id, project_id)
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid not null,
  provider text not null check (provider in ('instagram', 'facebook')),
  external_account_id text not null,
  account_type text not null,
  display_name text not null,
  username text,
  avatar_url text,
  status text not null default 'connected'
    check (status in ('connected', 'permission_required', 'expired', 'error', 'disconnected')),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, provider, external_account_id),
  unique(id, project_id),
  constraint social_accounts_connection_project_fk
    foreign key (connection_id, project_id)
    references public.social_connections(id, project_id)
    on delete cascade
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  internal_title text,
  base_caption text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'processing', 'partially_published', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  idempotency_key uuid not null default gen_random_uuid(),
  published_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, idempotency_key),
  unique(id, project_id),
  check (length(timezone) between 1 and 100)
);

create table public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  social_account_id uuid not null,
  provider text not null check (provider in ('instagram', 'facebook')),
  custom_caption text,
  provider_settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'claimed', 'uploading', 'processing', 'published', 'retrying', 'failed', 'unknown', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_until timestamptz,
  worker_id text,
  remote_post_id text,
  remote_container_id text,
  remote_url text,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id, social_account_id),
  unique(id, project_id),
  constraint social_post_targets_post_project_fk
    foreign key (post_id, project_id)
    references public.social_posts(id, project_id)
    on delete cascade,
  constraint social_post_targets_account_project_fk
    foreign key (social_account_id, project_id)
    references public.social_accounts(id, project_id)
    on delete restrict,
  check (locked_until is null or locked_at is not null)
);

create table public.social_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  position smallint not null check (position >= 0),
  alt_text text,
  checksum text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(post_id, position),
  constraint social_post_media_post_project_fk
    foreign key (post_id, project_id)
    references public.social_posts(id, project_id)
    on delete cascade
);

create table public.social_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  post_target_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('running', 'success', 'retryable_error', 'permanent_error', 'unknown')),
  provider_request_id text,
  http_status integer,
  safe_error_code text,
  safe_error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(post_target_id, attempt_number),
  constraint social_publish_attempts_target_project_fk
    foreign key (post_target_id, project_id)
    references public.social_post_targets(id, project_id)
    on delete cascade
);

create index social_connections_project_status_idx
  on public.social_connections(project_id, status);
create index social_accounts_project_provider_status_idx
  on public.social_accounts(project_id, provider, status);
create index social_posts_project_schedule_idx
  on public.social_posts(project_id, scheduled_at desc);
create index social_posts_project_status_idx
  on public.social_posts(project_id, status, updated_at desc);
create index social_post_targets_due_idx
  on public.social_post_targets(next_attempt_at, locked_until)
  where status in ('scheduled', 'claimed', 'processing', 'retrying');
create index social_post_targets_post_status_idx
  on public.social_post_targets(post_id, status);
create index social_post_media_post_position_idx
  on public.social_post_media(post_id, position);
create index social_publish_attempts_target_started_idx
  on public.social_publish_attempts(post_target_id, started_at desc);

create trigger set_social_connections_updated_at
before update on public.social_connections
for each row execute function public.handle_updated_at();

create trigger set_social_accounts_updated_at
before update on public.social_accounts
for each row execute function public.handle_updated_at();

create trigger set_social_posts_updated_at
before update on public.social_posts
for each row execute function public.handle_updated_at();

create trigger set_social_post_targets_updated_at
before update on public.social_post_targets
for each row execute function public.handle_updated_at();

alter table public.social_connections enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_targets enable row level security;
alter table public.social_post_media enable row level security;
alter table public.social_publish_attempts enable row level security;

revoke all on table public.social_connections from public, anon, authenticated;
revoke all on table public.social_accounts from public, anon, authenticated;
revoke all on table public.social_posts from public, anon, authenticated;
revoke all on table public.social_post_targets from public, anon, authenticated;
revoke all on table public.social_post_media from public, anon, authenticated;
revoke all on table public.social_publish_attempts from public, anon, authenticated;

grant select, insert, update, delete on table public.social_connections to service_role;
grant select, insert, update, delete on table public.social_accounts to service_role;
grant select, insert, update, delete on table public.social_posts to service_role;
grant select, insert, update, delete on table public.social_post_targets to service_role;
grant select, insert, update, delete on table public.social_post_media to service_role;
grant select, insert, update, delete on table public.social_publish_attempts to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.refresh_social_post_status(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_published integer;
  v_cancelled integer;
  v_failed integer;
  v_unknown integer;
  v_processing integer;
  v_draft integer;
  v_next_status text;
begin
  select
    count(*),
    count(*) filter (where status = 'published'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'unknown'),
    count(*) filter (where status in ('claimed', 'uploading', 'processing', 'retrying')),
    count(*) filter (where status = 'draft')
  into v_total, v_published, v_cancelled, v_failed, v_unknown, v_processing, v_draft
  from public.social_post_targets
  where post_id = p_post_id;

  if v_total = 0 or v_draft = v_total then
    v_next_status := 'draft';
  elsif v_cancelled = v_total then
    v_next_status := 'cancelled';
  elsif v_published = v_total then
    v_next_status := 'published';
  elsif v_published > 0 then
    v_next_status := 'partially_published';
  elsif v_processing > 0 then
    v_next_status := 'processing';
  elsif v_failed + v_unknown + v_cancelled = v_total then
    v_next_status := 'failed';
  else
    v_next_status := 'scheduled';
  end if;

  update public.social_posts
  set
    status = v_next_status,
    published_at = case
      when v_next_status = 'published' then coalesce(
        published_at,
        (select max(published_at) from public.social_post_targets where post_id = p_post_id)
      )
      else published_at
    end,
    cancelled_at = case
      when v_next_status = 'cancelled' then coalesce(cancelled_at, now())
      else cancelled_at
    end
  where id = p_post_id;
end;
$$;

create or replace function private.on_social_target_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_social_post_status(old.post_id);
    return old;
  end if;
  perform private.refresh_social_post_status(new.post_id);
  return new;
end;
$$;

revoke all on function private.refresh_social_post_status(uuid) from public, anon, authenticated;
revoke all on function private.on_social_target_status_change() from public, anon, authenticated;

create trigger refresh_social_post_after_target_change
after insert or update of status, published_at or delete
on public.social_post_targets
for each row execute function private.on_social_target_status_change();

create or replace function public.claim_social_publish_targets(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 120,
  p_post_id uuid default null
)
returns setof public.social_post_targets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) < 8 then
    raise exception 'worker_id is required';
  end if;

  return query
  with candidates as (
    select target.id
    from public.social_post_targets target
    join public.social_posts post on post.id = target.post_id
    where target.status in ('scheduled', 'claimed', 'processing', 'retrying')
      and coalesce(target.next_attempt_at, post.scheduled_at, post.created_at) <= now()
      and (target.locked_until is null or target.locked_until < now())
      and post.cancelled_at is null
      and (p_post_id is null or post.id = p_post_id)
    order by coalesce(target.next_attempt_at, post.scheduled_at, post.created_at), target.created_at
    for update of target skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.social_post_targets target
  set
    status = 'claimed',
    locked_at = now(),
    locked_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
    worker_id = p_worker_id
  from candidates
  where target.id = candidates.id
  returning target.*;
end;
$$;

revoke all on function public.claim_social_publish_targets(text, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_social_publish_targets(text, integer, integer, uuid)
  to service_role;

create or replace function public.create_social_post(
  p_project_id uuid,
  p_created_by uuid,
  p_internal_title text,
  p_base_caption text,
  p_scheduled_at timestamptz,
  p_timezone text,
  p_idempotency_key uuid,
  p_is_draft boolean,
  p_targets jsonb,
  p_media jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post_id uuid;
  v_target_count integer;
begin
  select id into v_post_id
  from public.social_posts
  where project_id = p_project_id and idempotency_key = p_idempotency_key;
  if v_post_id is not null then
    return v_post_id;
  end if;

  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'At least one target is required';
  end if;
  if jsonb_typeof(p_media) <> 'array' then
    raise exception 'Media must be an array';
  end if;

  insert into public.social_posts (
    project_id, created_by, internal_title, base_caption, status,
    scheduled_at, timezone, idempotency_key
  ) values (
    p_project_id,
    p_created_by,
    nullif(trim(p_internal_title), ''),
    coalesce(p_base_caption, ''),
    case when p_is_draft then 'draft' else 'scheduled' end,
    case when p_is_draft then null else p_scheduled_at end,
    p_timezone,
    p_idempotency_key
  ) returning id into v_post_id;

  insert into public.social_post_targets (
    post_id, project_id, social_account_id, provider, custom_caption,
    provider_settings, status, next_attempt_at
  )
  select
    v_post_id,
    p_project_id,
    account.id,
    account.provider,
    target.custom_caption,
    coalesce(target.provider_settings, '{}'::jsonb),
    case when p_is_draft then 'draft' else 'scheduled' end,
    case when p_is_draft then null else p_scheduled_at end
  from jsonb_to_recordset(p_targets) as target(
    social_account_id uuid,
    custom_caption text,
    provider_settings jsonb
  )
  join public.social_accounts account
    on account.id = target.social_account_id
   and account.project_id = p_project_id
   and account.status = 'connected';

  get diagnostics v_target_count = row_count;
  if v_target_count <> jsonb_array_length(p_targets) then
    raise exception 'One or more targets are unavailable';
  end if;

  insert into public.social_post_media (
    post_id, project_id, storage_path, media_type, mime_type, file_size,
    width, height, duration_ms, position, alt_text, checksum, metadata
  )
  select
    v_post_id,
    p_project_id,
    media.storage_path,
    media.media_type,
    media.mime_type,
    media.file_size,
    media.width,
    media.height,
    media.duration_ms,
    media.position,
    media.alt_text,
    media.checksum,
    coalesce(media.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_media) as media(
    storage_path text,
    media_type text,
    mime_type text,
    file_size bigint,
    width integer,
    height integer,
    duration_ms integer,
    position smallint,
    alt_text text,
    checksum text,
    metadata jsonb
  );

  return v_post_id;
end;
$$;

revoke all on function public.create_social_post(
  uuid, uuid, text, text, timestamptz, text, uuid, boolean, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_social_post(
  uuid, uuid, text, text, timestamptz, text, uuid, boolean, jsonb, jsonb
) to service_role;

create or replace function public.update_social_post(
  p_post_id uuid,
  p_project_id uuid,
  p_internal_title text,
  p_base_caption text,
  p_scheduled_at timestamptz,
  p_timezone text,
  p_is_draft boolean,
  p_targets jsonb,
  p_media jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_target_count integer;
begin
  select status into v_status
  from public.social_posts
  where id = p_post_id and project_id = p_project_id
  for update;
  if v_status is null then
    raise exception 'Post not found';
  end if;
  if v_status not in ('draft', 'scheduled') then
    raise exception 'Post can no longer be edited';
  end if;
  if exists (
    select 1 from public.social_post_targets
    where post_id = p_post_id and status not in ('draft', 'scheduled')
  ) then
    raise exception 'A target has already started processing';
  end if;

  update public.social_posts
  set
    internal_title = nullif(trim(p_internal_title), ''),
    base_caption = coalesce(p_base_caption, ''),
    status = case when p_is_draft then 'draft' else 'scheduled' end,
    scheduled_at = case when p_is_draft then null else p_scheduled_at end,
    timezone = p_timezone
  where id = p_post_id;

  delete from public.social_post_targets where post_id = p_post_id;
  delete from public.social_post_media where post_id = p_post_id;

  insert into public.social_post_targets (
    post_id, project_id, social_account_id, provider, custom_caption,
    provider_settings, status, next_attempt_at
  )
  select
    p_post_id,
    p_project_id,
    account.id,
    account.provider,
    target.custom_caption,
    coalesce(target.provider_settings, '{}'::jsonb),
    case when p_is_draft then 'draft' else 'scheduled' end,
    case when p_is_draft then null else p_scheduled_at end
  from jsonb_to_recordset(p_targets) as target(
    social_account_id uuid,
    custom_caption text,
    provider_settings jsonb
  )
  join public.social_accounts account
    on account.id = target.social_account_id
   and account.project_id = p_project_id
   and account.status = 'connected';
  get diagnostics v_target_count = row_count;
  if v_target_count <> jsonb_array_length(p_targets) then
    raise exception 'One or more targets are unavailable';
  end if;

  insert into public.social_post_media (
    post_id, project_id, storage_path, media_type, mime_type, file_size,
    width, height, duration_ms, position, alt_text, checksum, metadata
  )
  select
    p_post_id, p_project_id, media.storage_path, media.media_type,
    media.mime_type, media.file_size, media.width, media.height,
    media.duration_ms, media.position, media.alt_text, media.checksum,
    coalesce(media.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_media) as media(
    storage_path text,
    media_type text,
    mime_type text,
    file_size bigint,
    width integer,
    height integer,
    duration_ms integer,
    position smallint,
    alt_text text,
    checksum text,
    metadata jsonb
  );

  return p_post_id;
end;
$$;

revoke all on function public.update_social_post(
  uuid, uuid, text, text, timestamptz, text, boolean, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.update_social_post(
  uuid, uuid, text, text, timestamptz, text, boolean, jsonb, jsonb
) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-publishing',
  'social-publishing',
  false,
  524288000,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.social_connections is
  'Meta publishing connection. Reuses the Instagram Analytics Vault credential when source_connection_id is set.';
comment on table public.social_post_targets is
  'Independent delivery state for each Instagram professional account or Facebook Page.';
comment on function public.claim_social_publish_targets(text, integer, integer, uuid) is
  'Atomically leases due social publishing targets using FOR UPDATE SKIP LOCKED. Service role only.';
