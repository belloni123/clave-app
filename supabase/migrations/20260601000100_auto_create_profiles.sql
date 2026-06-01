-- ════════════════════════════════════════════════
-- MIGRATION: AUTO-CREATE PROFILES & RLS CORRECTIONS
-- ════════════════════════════════════════════════

-- 1. CORREÇÃO DAS POLÍTICAS DE RLS NA TABELA PROFILES
-- Remove a política antiga restritiva (que usava FOR ALL para admins)
drop policy if exists "Apenas administradores criam ou deletam perfis" on public.profiles;

-- Permite que usuários autenticados criem o seu próprio perfil (necessário para o fallback do client-side)
create policy "Usuários podem criar seu próprio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Restringe exclusão de perfis apenas para administradores
create policy "Apenas administradores podem deletar perfis"
  on public.profiles for delete
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));


-- 2. TRIGGER AUTOMÁTICO PARA CRIAÇÃO DE PERFIL
-- Cria ou atualiza a função de trigger que roda com bypass de segurança (security definer)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, plan, max_projects)
  values (new.id, 'client', 'free', 2)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Associa a função ao trigger após inserção na tabela auth.users do Supabase Auth
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 3. AJUSTE RETROATIVO (BACKFILL)
-- Cria perfis para usuários existentes no auth.users que eventualmente não possuam perfil
insert into public.profiles (id, role, plan, max_projects)
select id, 'client', 'free', 2 
from auth.users
on conflict (id) do nothing;
