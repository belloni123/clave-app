-- ════════════════════════════════════════════════
-- MIGRATION: RESOLVE INFINITE RECURSION ON PROJECTS & COLAB ASSIGNMENTS
-- ════════════════════════════════════════════════

-- 1. Criar helper function get_project_owner com SECURITY DEFINER
-- Isso permite consultar o dono do projeto ignorando as políticas de RLS,
-- quebrando a recursão infinita entre as tabelas 'projects' e 'colab_assignments'.
create or replace function public.get_project_owner(proj_id uuid)
returns uuid as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.projects where id = proj_id;
  return owner_id;
end;
$$ language plpgsql security definer;

-- 2. Remover as políticas antigas recursivas da tabela 'colab_assignments'
drop policy if exists "Atribuições visíveis para o dono do projeto, o colaborador e admins" on public.colab_assignments;
drop policy if exists "Dono do projeto ou admin podem gerenciar atribuições" on public.colab_assignments;

-- 3. Criar as novas políticas não-recursivas usando a helper function
create policy "Atribuições visíveis para o dono do projeto, o colaborador e admins"
  on public.colab_assignments for select
  using (
    colab_id = auth.uid()
    or public.get_project_owner(project_id) = auth.uid()
    or public.is_admin(auth.uid())
  );

create policy "Dono do projeto ou admin podem gerenciar atribuições"
  on public.colab_assignments for all
  using (
    public.get_project_owner(project_id) = auth.uid()
    or public.is_admin(auth.uid())
  );
