-- Global SMTP metadata. The SMTP password lives only in Supabase Vault.
create table if not exists public.smtp_settings (
  id boolean primary key default true check (id),
  domain text,
  support_whatsapp text,
  tutorial_url text,
  smtp_host text not null default 'smtp.gmail.com',
  smtp_port integer not null default 465 check (smtp_port in (465, 587)),
  smtp_security text not null default 'ssl' check (smtp_security in ('ssl', 'starttls')),
  smtp_user text,
  smtp_sender_name text not null default 'Clave',
  smtp_sender_email text,
  smtp_password_secret_id uuid,
  auth_configured_at timestamptz,
  last_tested_at timestamptz,
  last_test_status boolean,
  last_test_error text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.smtp_settings_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('save', 'test')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.smtp_settings enable row level security;
alter table public.smtp_settings_audit enable row level security;

-- These tables and the Vault bridge are server-only. Browser roles get no access.
revoke all on table public.smtp_settings from public, anon, authenticated;
revoke all on table public.smtp_settings_audit from public, anon, authenticated;
grant select, insert, update on table public.smtp_settings to service_role;
grant select, insert on table public.smtp_settings_audit to service_role;

insert into public.smtp_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists set_smtp_settings_updated_at on public.smtp_settings;
create trigger set_smtp_settings_updated_at
before update on public.smtp_settings
for each row execute function public.handle_updated_at();

-- Store or rotate the SMTP password without returning its plaintext to the app.
create or replace function public.set_smtp_secret(
  p_secret_id uuid,
  p_secret_value text
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
  if p_secret_value is null or length(p_secret_value) = 0 then
    raise exception 'SMTP secret cannot be empty';
  end if;

  if p_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret_value,
      'clave_smtp_password_' || gen_random_uuid()::text,
      'Clave Google Workspace SMTP password',
      null
    );
  else
    select name, description
      into v_name, v_description
      from vault.decrypted_secrets
     where id = p_secret_id;

    if v_name is null then
      raise exception 'SMTP secret not found';
    end if;

    perform vault.update_secret(
      p_secret_id,
      p_secret_value,
      v_name,
      v_description,
      null
    );
    v_secret_id := p_secret_id;
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.get_smtp_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where id = p_secret_id;
$$;

revoke all on function public.set_smtp_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.get_smtp_secret(uuid) from public, anon, authenticated;
grant execute on function public.set_smtp_secret(uuid, text) to service_role;
grant execute on function public.get_smtp_secret(uuid) to service_role;

comment on table public.smtp_settings is
  'Global SMTP metadata. Password is stored in Supabase Vault and is never exposed through this table.';
comment on table public.smtp_settings_audit is
  'Server-side audit trail for SMTP saves and connection tests. Never store credentials here.';
