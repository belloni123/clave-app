-- ============================================================================
-- CLAVE - Limite de criacao de respostas em formularios publicos
-- ============================================================================

create table public.project_form_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table public.project_form_rate_limits enable row level security;
revoke all on public.project_form_rate_limits from public, anon, authenticated;
grant select, insert, update on public.project_form_rate_limits to service_role;

create or replace function public.consume_project_form_rate_limit(
  rate_key text,
  max_attempts integer default 20
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed boolean;
begin
  insert into public.project_form_rate_limits(
    key_hash,
    window_started_at,
    attempts,
    updated_at
  )
  values (rate_key, now(), 1, now())
  on conflict (key_hash) do update
  set
    attempts = case
      when project_form_rate_limits.window_started_at <= now() - interval '1 hour'
        then 1
      else project_form_rate_limits.attempts + 1
    end,
    window_started_at = case
      when project_form_rate_limits.window_started_at <= now() - interval '1 hour'
        then now()
      else project_form_rate_limits.window_started_at
    end,
    updated_at = now()
  returning attempts <= greatest(max_attempts, 1) into allowed;

  return allowed;
end;
$$;

revoke all on function public.consume_project_form_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_project_form_rate_limit(text, integer)
  to service_role;

comment on table public.project_form_rate_limits is
  'Contador horario por formulario e origem; a chave recebida ja esta protegida por HMAC.';
