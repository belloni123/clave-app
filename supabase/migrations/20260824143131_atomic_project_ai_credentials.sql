-- Keep Vault changes and project metadata in the same transaction. These
-- functions are server-only and are called after application authorization.

create or replace function public.configure_project_ai_provider(
  p_project_id uuid,
  p_provider text,
  p_secret_value text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_existing_secret_id uuid;
  v_name text;
  v_description text;
begin
  if p_provider not in ('openai', 'anthropic') then
    raise exception 'Unsupported AI provider';
  end if;
  if p_secret_value is null or length(trim(p_secret_value)) < 8 then
    raise exception 'AI secret cannot be empty';
  end if;

  select case
    when p_provider = 'openai' then openai_secret_id
    else anthropic_secret_id
  end
    into v_existing_secret_id
    from public.project_ai_settings
   where project_id = p_project_id
   for update;

  if v_existing_secret_id is null then
    v_secret_id := vault.create_secret(
      trim(p_secret_value),
      'clave_project_ai_' || p_project_id::text || '_' || p_provider || '_' || gen_random_uuid()::text,
      'Clave project AI key for ' || p_provider,
      null
    );
  else
    select name, description
      into v_name, v_description
      from vault.decrypted_secrets
     where id = v_existing_secret_id;

    if v_name is null then
      raise exception 'AI secret not found';
    end if;

    perform vault.update_secret(
      v_existing_secret_id,
      trim(p_secret_value),
      v_name,
      v_description,
      null
    );
    v_secret_id := v_existing_secret_id;
  end if;

  if p_provider = 'openai' then
    insert into public.project_ai_settings (
      project_id,
      active_provider,
      openai_secret_id,
      openai_key_hint,
      openai_verified_at,
      updated_by
    ) values (
      p_project_id,
      p_provider,
      v_secret_id,
      right(trim(p_secret_value), 4),
      now(),
      p_updated_by
    )
    on conflict (project_id) do update set
      active_provider = excluded.active_provider,
      openai_secret_id = excluded.openai_secret_id,
      openai_key_hint = excluded.openai_key_hint,
      openai_verified_at = excluded.openai_verified_at,
      updated_by = excluded.updated_by;
  else
    insert into public.project_ai_settings (
      project_id,
      active_provider,
      anthropic_secret_id,
      anthropic_key_hint,
      anthropic_verified_at,
      updated_by
    ) values (
      p_project_id,
      p_provider,
      v_secret_id,
      right(trim(p_secret_value), 4),
      now(),
      p_updated_by
    )
    on conflict (project_id) do update set
      active_provider = excluded.active_provider,
      anthropic_secret_id = excluded.anthropic_secret_id,
      anthropic_key_hint = excluded.anthropic_key_hint,
      anthropic_verified_at = excluded.anthropic_verified_at,
      updated_by = excluded.updated_by;
  end if;
end;
$$;

create or replace function public.remove_project_ai_provider(
  p_project_id uuid,
  p_provider text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_settings public.project_ai_settings%rowtype;
  v_secret_id uuid;
begin
  if p_provider not in ('openai', 'anthropic') then
    raise exception 'Unsupported AI provider';
  end if;

  select * into v_settings
    from public.project_ai_settings
   where project_id = p_project_id
   for update;

  if not found then
    return;
  end if;

  if p_provider = 'openai' then
    v_secret_id := v_settings.openai_secret_id;
    update public.project_ai_settings set
      openai_secret_id = null,
      openai_key_hint = null,
      openai_verified_at = null,
      active_provider = case
        when active_provider = 'openai' and anthropic_secret_id is not null then 'anthropic'
        else active_provider
      end,
      updated_by = p_updated_by
    where project_id = p_project_id;
  else
    v_secret_id := v_settings.anthropic_secret_id;
    update public.project_ai_settings set
      anthropic_secret_id = null,
      anthropic_key_hint = null,
      anthropic_verified_at = null,
      active_provider = case
        when active_provider = 'anthropic' and openai_secret_id is not null then 'openai'
        else active_provider
      end,
      updated_by = p_updated_by
    where project_id = p_project_id;
  end if;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.configure_project_ai_provider(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.remove_project_ai_provider(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.configure_project_ai_provider(uuid, text, text, uuid)
  to service_role;
grant execute on function public.remove_project_ai_provider(uuid, text, uuid)
  to service_role;
