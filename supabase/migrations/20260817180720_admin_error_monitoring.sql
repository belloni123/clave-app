-- ============================================================================
-- CLAVE - Monitoramento interno de erros
-- ============================================================================

create table public.app_error_events (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique
    check (reference_code ~ '^CLV-[A-F0-9]{8}$'),
  status text not null default 'new'
    check (status in ('new', 'investigating', 'resolved')),
  severity text not null default 'error'
    check (severity in ('warning', 'error', 'critical')),
  source text not null
    check (source in ('server', 'browser')),
  category text not null
    check (category in (
      'public_briefing',
      'expert_application',
      'briefing_attachment',
      'client_runtime'
    )),
  operation text not null check (char_length(operation) between 2 and 100),
  project_id uuid references public.projects(id) on delete set null,
  form_id uuid references public.project_forms(id) on delete set null,
  submission_id uuid references public.project_form_submissions(id) on delete set null,
  lead_email text check (lead_email is null or char_length(lead_email) <= 254),
  page_path text check (page_path is null or char_length(page_path) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  http_status smallint check (http_status is null or http_status between 400 and 599),
  error_name text check (error_name is null or char_length(error_name) <= 120),
  message text not null check (char_length(message) between 2 and 1000),
  technical_message text check (
    technical_message is null or char_length(technical_message) <= 4000
  ),
  fingerprint text not null check (char_length(fingerprint) = 64),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  admin_notes text not null default '' check (char_length(admin_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_error_events_resolution_consistency check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create index app_error_events_status_occurred_idx
  on public.app_error_events(status, occurred_at desc);
create index app_error_events_project_occurred_idx
  on public.app_error_events(project_id, occurred_at desc)
  where project_id is not null;
create index app_error_events_fingerprint_idx
  on public.app_error_events(fingerprint, occurred_at desc);
create index app_error_events_resolved_by_idx
  on public.app_error_events(resolved_by)
  where resolved_by is not null;

create trigger set_updated_at_app_error_events
  before update on public.app_error_events
  for each row execute function public.handle_updated_at();

alter table public.app_error_events enable row level security;

create policy app_error_events_admin_select
  on public.app_error_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
        and (profile.role = 'admin' or profile.agency_role = 'admin')
    )
  );

create policy app_error_events_admin_update
  on public.app_error_events
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
        and (profile.role = 'admin' or profile.agency_role = 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
        and (profile.role = 'admin' or profile.agency_role = 'admin')
    )
  );

revoke all on public.app_error_events from anon, authenticated;
grant select on public.app_error_events to authenticated;
grant update(status, resolved_at, resolved_by, admin_notes)
  on public.app_error_events to authenticated;

-- O endpoint publico nunca insere diretamente nesta tabela. Ele usa o cliente
-- de servidor e este contador protegido para limitar abuso por origem.
create table public.app_error_event_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table public.app_error_event_rate_limits enable row level security;
revoke all on public.app_error_event_rate_limits from public, anon, authenticated;

create or replace function public.consume_app_error_event_rate_limit(
  rate_key text,
  max_attempts integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
begin
  if rate_key is null or char_length(rate_key) <> 64 then
    return false;
  end if;

  if max_attempts < 1 or max_attempts > 100 then
    return false;
  end if;

  delete from public.app_error_event_rate_limits
  where updated_at < now() - interval '2 hours';

  insert into public.app_error_event_rate_limits as limits (
    key_hash,
    window_started_at,
    attempts,
    updated_at
  ) values (
    rate_key,
    now(),
    1,
    now()
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when limits.window_started_at < now() - interval '1 hour' then now()
      else limits.window_started_at
    end,
    attempts = case
      when limits.window_started_at < now() - interval '1 hour' then 1
      else limits.attempts + 1
    end,
    updated_at = now()
  returning attempts into current_attempts;

  return current_attempts <= max_attempts;
end;
$$;

revoke all on function public.consume_app_error_event_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_app_error_event_rate_limit(text, integer)
  to service_role;

comment on table public.app_error_events is
  'Falhas operacionais do Clave com acesso exclusivo para administradores.';
comment on column public.app_error_events.metadata is
  'Contexto tecnico limitado; nunca deve conter senhas, tokens ou respostas completas.';
