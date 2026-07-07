-- ════════════════════════════════════════════════
-- MIGRATION: CORREÇÃO DAS POLÍTICAS RLS DE TEAM_MEMBERS
-- ════════════════════════════════════════════════

-- 1. Remover as políticas anteriores que causavam erro de permissão no select
drop policy if exists "Membros visíveis para donos, o próprio colaborador ou admins" on public.team_members;
drop policy if exists "Donos de projetos ou admins podem gerenciar membros da equipe" on public.team_members;

-- 2. Criar a política de leitura corrigida usando a claim do JWT para obter o e-mail do usuário autenticado
create policy "Membros visíveis para donos, o próprio colaborador ou admins"
  on public.team_members for select
  using (
    owner_id = auth.uid()
    or email = (auth.jwt() ->> 'email')
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- 3. Criar a política de escrita/gerenciamento corrigida
create policy "Donos de projetos ou admins podem gerenciar membros da equipe"
  on public.team_members for all
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );
