-- Keep the public profile synchronized with Supabase Auth so project access
-- can be granted by e-mail from the Clave administration screen.
alter table public.profiles
  add column if not exists nome text,
  add column if not exists email text;

update public.profiles profile
set
  email = coalesce(profile.email, auth_user.email),
  nome = coalesce(
    nullif(profile.nome, ''),
    auth_user.raw_user_meta_data ->> 'nome',
    auth_user.raw_user_meta_data ->> 'name',
    auth_user.raw_user_meta_data ->> 'full_name',
    split_part(auth_user.email, '@', 1)
  )
from auth.users auth_user
where auth_user.id = profile.id
  and (profile.email is null or profile.nome is null or profile.nome = '');

create unique index if not exists profiles_email_lower_unique
  on public.profiles (lower(email))
  where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, plan, max_projects, email, nome)
  values (
    new.id,
    'client',
    'free',
    2,
    lower(new.email),
    coalesce(
      new.raw_user_meta_data ->> 'nome',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.trg_audit_project_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_actor uuid := coalesce(auth.uid(), new.concedido_por);
begin
  if tg_op = 'INSERT' then
    insert into public.project_access_audit(
      project_id,
      target_user_id,
      actor_id,
      acao,
      nivel_anterior,
      nivel_novo,
      modulos_novos
    )
    values (
      new.project_id,
      new.user_id,
      audit_actor,
      'grant',
      null,
      new.permission_level,
      new.allowed_modules
    );
  elsif tg_op = 'UPDATE' then
    if old.ativo and not new.ativo then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        audit_actor,
        'revoke',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    elsif not old.ativo and new.ativo then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        audit_actor,
        'grant',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    elsif old.permission_level <> new.permission_level then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        audit_actor,
        'update_level',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    elsif old.allowed_modules is distinct from new.allowed_modules then
      insert into public.project_access_audit(
        project_id,
        target_user_id,
        actor_id,
        acao,
        nivel_anterior,
        nivel_novo,
        modulos_anteriores,
        modulos_novos
      )
      values (
        new.project_id,
        new.user_id,
        audit_actor,
        'update_modules',
        old.permission_level,
        new.permission_level,
        old.allowed_modules,
        new.allowed_modules
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_audit_project_access() from public, anon, authenticated;

-- This helper is callable by authenticated clients because RLS policies use
-- it, so fail closed if a caller tries to check permissions for another user.
create or replace function public.user_can_administer_project(
  proj_id uuid,
  usr_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    usr_id = auth.uid()
    and (
      exists (
        select 1
        from public.profiles profile
        where profile.id = usr_id
          and profile.role = 'admin'
          and profile.deleted_at is null
      )
      or exists (
        select 1
        from public.profiles profile
        join public.projects project on project.id = proj_id
        where profile.id = usr_id
          and profile.agency_id = project.agency_id
          and profile.agency_role = 'admin'
          and profile.deleted_at is null
      )
      or exists (
        select 1
        from public.projects project
        where project.id = proj_id
          and project.user_id = usr_id
          and project.deleted_at is null
      )
      or exists (
        select 1
        from public.project_users project_user
        where project_user.project_id = proj_id
          and project_user.user_id = usr_id
          and project_user.ativo
          and project_user.permission_level = 'admin'
      )
    );
$$;

revoke all on function public.user_can_administer_project(uuid, uuid) from public;
grant execute on function public.user_can_administer_project(uuid, uuid) to authenticated;
