-- ════════════════════════════════════════════════
-- MIGRATION: FIX RLS INFINITE RECURSION
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

-- 2. Update SELECT and DELETE policies on profiles table using the is_admin helper
drop policy if exists "Usuários podem ver seu próprio perfil ou administradores todos" on public.profiles;
create policy "Usuários podem ver seu próprio perfil ou administradores todos"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "Apenas administradores podem deletar perfis" on public.profiles;
create policy "Apenas administradores podem deletar perfis"
  on public.profiles for delete
  using (public.is_admin(auth.uid()));

-- 3. Update SELECT and ALL policies on projects table using the is_admin helper
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

-- 4. Update SELECT and ALL policies on colab_assignments table using the is_admin helper
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
