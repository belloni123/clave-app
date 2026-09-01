#!/bin/sh
set -eu

for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing local PostgreSQL command: $command_name" >&2
    exit 1
  fi
done

CLAVE_PG_TMP=$(mktemp -d /tmp/clave-social-db.XXXXXX)
CLAVE_PG_SOCKET="$CLAVE_PG_TMP/socket"
CLAVE_PG_PORT=${SOCIAL_TEST_PGPORT:-55439}
mkdir "$CLAVE_PG_SOCKET"

cleanup() {
  pg_ctl -D "$CLAVE_PG_TMP/data" -m fast -w stop >/dev/null 2>&1 || true
  case "$CLAVE_PG_TMP" in
    /tmp/clave-social-db.*) rm -r -- "$CLAVE_PG_TMP" ;;
  esac
}
trap cleanup EXIT INT TERM

initdb -D "$CLAVE_PG_TMP/data" --no-locale --encoding=UTF8 >/dev/null
pg_ctl -D "$CLAVE_PG_TMP/data" -o "-k $CLAVE_PG_SOCKET -p $CLAVE_PG_PORT" -w start >/dev/null

psql -h "$CLAVE_PG_SOCKET" -p "$CLAVE_PG_PORT" -d postgres -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid());
create table public.profiles (id uuid primary key references auth.users(id), nome text, email text);
create table public.projects (id uuid primary key default gen_random_uuid());
create table public.instagram_connections (id uuid primary key default gen_random_uuid());
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create function public.handle_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
SQL

psql -h "$CLAVE_PG_SOCKET" -p "$CLAVE_PG_PORT" -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260901175238_meta_social_publishing.sql >/dev/null

psql -h "$CLAVE_PG_SOCKET" -p "$CLAVE_PG_PORT" -d postgres -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into auth.users (id) values ('10000000-0000-4000-8000-000000000001');
insert into public.profiles (id, nome, email) values ('10000000-0000-4000-8000-000000000001', 'Teste', 'teste@example.test');
insert into public.projects (id) values ('20000000-0000-4000-8000-000000000001');
insert into public.instagram_connections (id) values ('30000000-0000-4000-8000-000000000001');
insert into public.social_connections (
  id, project_id, provider, source_connection_id
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'meta',
  '30000000-0000-4000-8000-000000000001'
);
insert into public.social_accounts (
  id, project_id, connection_id, provider, external_account_id, account_type, display_name
) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'instagram', 'ig-test', 'professional', 'Instagram teste'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'facebook', 'page-test', 'page', 'Página teste');

do $$
declare
  first_id uuid;
  duplicate_id uuid;
  claimed_count integer;
  second_worker_count integer;
  recovered_count integer;
  partial_id uuid;
  editable_id uuid;
  derived_status text;
begin
  first_id := public.create_social_post(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Idempotente',
    'Legenda',
    now() - interval '1 minute',
    'America/Sao_Paulo',
    '60000000-0000-4000-8000-000000000001',
    false,
    '[{"social_account_id":"50000000-0000-4000-8000-000000000001"}]'::jsonb,
    '[]'::jsonb
  );
  duplicate_id := public.create_social_post(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Clique repetido',
    'Outro conteúdo',
    now(),
    'America/Sao_Paulo',
    '60000000-0000-4000-8000-000000000001',
    false,
    '[{"social_account_id":"50000000-0000-4000-8000-000000000001"}]'::jsonb,
    '[]'::jsonb
  );
  if first_id <> duplicate_id or (select count(*) from public.social_posts) <> 1 then
    raise exception 'idempotency assertion failed';
  end if;

  select count(*) into claimed_count
  from public.claim_social_publish_targets('worker-one', 5, 120, null);
  select count(*) into second_worker_count
  from public.claim_social_publish_targets('worker-two', 5, 120, null);
  if claimed_count <> 1 or second_worker_count <> 0 then
    raise exception 'atomic claim assertion failed';
  end if;

  update public.social_post_targets
  set locked_until = now() - interval '1 second'
  where post_id = first_id;
  select count(*) into recovered_count
  from public.claim_social_publish_targets('worker-two', 5, 120, null);
  if recovered_count <> 1 then
    raise exception 'expired lease recovery assertion failed';
  end if;

  partial_id := public.create_social_post(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Parcial',
    'Legenda',
    now() + interval '1 hour',
    'America/Sao_Paulo',
    '60000000-0000-4000-8000-000000000002',
    false,
    '[{"social_account_id":"50000000-0000-4000-8000-000000000001"},{"social_account_id":"50000000-0000-4000-8000-000000000002"}]'::jsonb,
    '[]'::jsonb
  );
  update public.social_post_targets set status = 'published', published_at = now()
  where post_id = partial_id and provider = 'instagram';
  update public.social_post_targets set status = 'failed'
  where post_id = partial_id and provider = 'facebook';
  select status into derived_status from public.social_posts where id = partial_id;
  if derived_status <> 'partially_published' then
    raise exception 'partial status assertion failed: %', derived_status;
  end if;

  editable_id := public.create_social_post(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Rascunho',
    '',
    null,
    'America/Sao_Paulo',
    '60000000-0000-4000-8000-000000000003',
    true,
    '[{"social_account_id":"50000000-0000-4000-8000-000000000001"}]'::jsonb,
    '[]'::jsonb
  );
  perform public.update_social_post(
    editable_id,
    '20000000-0000-4000-8000-000000000001',
    'Editado',
    'Texto final',
    now() + interval '2 hours',
    'America/Sao_Paulo',
    false,
    '[{"social_account_id":"50000000-0000-4000-8000-000000000002"}]'::jsonb,
    '[]'::jsonb
  );
  if (select internal_title from public.social_posts where id = editable_id) <> 'Editado'
    or (select provider from public.social_post_targets where post_id = editable_id) <> 'facebook' then
    raise exception 'edit assertion failed';
  end if;
  update public.social_post_targets set status = 'cancelled' where post_id = editable_id;
  select status into derived_status from public.social_posts where id = editable_id;
  if derived_status <> 'cancelled' then
    raise exception 'cancel status assertion failed: %', derived_status;
  end if;
end;
$$;
SQL

echo "Social migration integration test passed."
