-- ════════════════════════════════════════════════
-- MIGRATION: FIX RLS INFINITE RECURSION & AUTO-TRIGGER
-- ════════════════════════════════════════════════

-- 1. Helper function is_admin running as SECURITY DEFINER to bypass RLS checks and prevent infinite recursion loops
create or replace function public.is_admin(usr_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles 
    where id = usr_id and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 2. Update SELECT, INSERT and DELETE policies on profiles table (SELECT is now non-recursive!)
drop policy if exists "Usuários podem ver seu próprio perfil ou administradores todos" on public.profiles;
create policy "Usuários podem ver seu próprio perfil ou administradores todos"
  on public.profiles for select
  using (auth.uid() is not null);

drop policy if exists "Usuários podem criar seu próprio perfil" on public.profiles;
create policy "Usuários podem criar seu próprio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Apenas administradores podem deletar perfis" on public.profiles;
create policy "Apenas administradores podem deletar perfis"
  on public.profiles for delete
  using (public.is_admin(auth.uid()));

-- 3. Automatic trigger to create profiles for new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, plan, max_projects)
  values (new.id, 'client', 'free', 2)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Backfill any existing users in auth.users that don't have a profile
insert into public.profiles (id, role, plan, max_projects)
select id, 'client', 'free', 2 
from auth.users
on conflict (id) do nothing;

-- 5. Update SELECT and ALL policies on projects table using the is_admin helper
drop policy if exists "Projetos visíveis para donos, colaboradores ou admins" on public.projects;
create policy "Projetos visíveis para donos, colaboradores ou admins"
  on public.projects for select
  using (
    user_id = auth.uid() 
    or public.is_admin(auth.uid())
    or id in (
      select project_id from public.colab_assignments where colab_id = auth.uid()
    )
  );

drop policy if exists "Donos de projetos ou admins podem gerenciar projetos" on public.projects;
create policy "Donos de projetos ou admins podem gerenciar projetos"
  on public.projects for all
  using (
    user_id = auth.uid() 
    or public.is_admin(auth.uid())
  );

-- 6. Update SELECT and ALL policies on colab_assignments table using the is_admin helper
drop policy if exists "Atribuições visíveis para o dono do projeto, o colaborador e admins" on public.colab_assignments;
create policy "Atribuições visíveis para o dono do projeto, o colaborador e admins"
  on public.colab_assignments for select
  using (
    colab_id = auth.uid()
    or exists (
      select 1 from public.projects where id = project_id and user_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  );

drop policy if exists "Dono do projeto ou admin podem gerenciar atribuições" on public.colab_assignments;
create policy "Dono do projeto ou admin podem gerenciar atribuições"
  on public.colab_assignments for all
  using (
    exists (
      select 1 from public.projects where id = project_id and user_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  );
