-- ════════════════════════════════════════════════
-- MIGRATION: REFINED RLS, CLEANUP & AUTO-TRIGGER
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

-- 2. Drop ALL existing policies to ensure no stale recursive rules (like the old 'FOR ALL' policy) are left behind
drop policy if exists "Usuários podem ver seu próprio perfil ou administradores todos" on public.profiles;
drop policy if exists "Usuários podem atualizar seu próprio perfil" on public.profiles;
drop policy if exists "Apenas administradores criam ou deletam perfis" on public.profiles;
drop policy if exists "Usuários podem criar seu próprio perfil" on public.profiles;
drop policy if exists "Apenas administradores podem deletar perfis" on public.profiles;

drop policy if exists "Projetos visíveis para donos, colaboradores ou admins" on public.projects;
drop policy if exists "Donos de projetos ou admins podem gerenciar projetos" on public.projects;

drop policy if exists "Atribuições visíveis para o dono do projeto, o colaborador e admins" on public.colab_assignments;
drop policy if exists "Dono do projeto ou admin podem gerenciar atribuições" on public.colab_assignments;

-- 3. Re-create clean, non-recursive policies for Profiles
create policy "Usuários podem ver seu próprio perfil ou administradores todos"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "Usuários podem criar seu próprio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Usuários podem atualizar seu próprio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Apenas administradores podem deletar perfis"
  on public.profiles for delete
  using (public.is_admin(auth.uid()));

-- 4. Re-create clean policies for Projects
create policy "Projetos visíveis para donos, colaboradores ou admins"
  on public.projects for select
  using (
    user_id = auth.uid() 
    or public.is_admin(auth.uid())
    or id in (
      select project_id from public.colab_assignments where colab_id = auth.uid()
    )
  );

create policy "Donos de projetos ou admins podem gerenciar projetos"
  on public.projects for all
  using (
    user_id = auth.uid() 
    or public.is_admin(auth.uid())
  );

-- 5. Re-create clean policies for Colab Assignments
create policy "Atribuições visíveis para o dono do projeto, o colaborador e admins"
  on public.colab_assignments for select
  using (
    colab_id = auth.uid()
    or exists (
      select 1 from public.projects where id = project_id and user_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  );

create policy "Dono do projeto ou admin podem gerenciar atribuições"
  on public.colab_assignments for all
  using (
    exists (
      select 1 from public.projects where id = project_id and user_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  );

-- 6. Automatic trigger to create profiles for new users
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

-- 7. Backfill any existing users in auth.users that don't have a profile
insert into public.profiles (id, role, plan, max_projects)
select id, 'client', 'free', 2 
from auth.users
on conflict (id) do nothing;
