-- Account lifecycle is independent of project grants, so unblocking restores
-- exactly the previous permissions. Deletion retains authorship and projects.
alter table public.profiles add column blocked_at timestamptz;

create schema if not exists private;
grant usage on schema private to authenticated, anon, service_role;

-- A narrowly scoped definer lookup avoids recursion when profiles itself is
-- protected. No caller-supplied identity; only the authenticated subject is read.
create function private.team_account_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles where id = auth.uid()
      and blocked_at is null and deleted_at is null
  );
$$;
revoke all on function private.team_account_active() from public, anon;
grant execute on function private.team_account_active() to authenticated;

create function private.check_team_account()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if not private.team_account_active() then
      raise insufficient_privilege using message = 'Conta bloqueada ou excluída. Contate o administrador.';
    end if;
  end if;
end;
$$;
revoke all on function private.check_team_account() from public;
grant execute on function private.check_team_account() to anon, authenticated, service_role;

-- Protect status from self-edits through existing profile update policies.
create function private.protect_team_account_status()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and
    (new.blocked_at is distinct from old.blocked_at or new.deleted_at is distinct from old.deleted_at) then
    raise insufficient_privilege using message = 'Somente o servidor pode alterar o estado da conta.';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_team_account_status() from public;
create trigger protect_team_account_status before update on public.profiles
for each row execute function private.protect_team_account_status();

-- Restrictive policies complement all existing permissions; they never grant
-- new access. These also protect Realtime and Storage with already-issued JWTs.
do $$
declare item record;
begin
  for item in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  loop
    execute format('create policy active_team_account on %I.%I as restrictive for all to authenticated using ((select private.team_account_active())) with check ((select private.team_account_active()))', item.nspname, item.relname);
  end loop;
end;
$$;

-- The hook also covers exposed SECURITY DEFINER RPCs that bypass table RLS.
-- Fail rather than overwrite another pre-request hook on an unexpected host.
do $$
begin
  if exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) config
    where s.setrole = (select oid from pg_roles where rolname = 'authenticator')
      and config like 'pgrst.db_pre_request=%' and config <> 'pgrst.db_pre_request=') then
    raise exception 'Review the existing Data API pre-request hook before installing account lifecycle';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'private.check_team_account';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
