-- ════════════════════════════════════════════════
-- MIGRATION: CREATE TEAM_MEMBERS TABLE & RLS
-- ════════════════════════════════════════════════

-- 1. CRIAR TABELA
create table if not exists public.team_members (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  role text not null,
  email text not null,
  permissions text[] default '{}'::text[] not null, -- Array de módulos permitidos
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- 2. ATIVAR RLS
alter table public.team_members enable row level security;

-- 3. TRIGGER DE ATUALIZAÇÃO AUTOMÁTICA
create trigger set_updated_at_team_members
  before update on public.team_members
  for each row execute function public.handle_updated_at();

-- 4. POLÍTICAS RLS DE SEGURANÇA
create policy "Membros visíveis para donos, o próprio colaborador ou admins"
  on public.team_members for select
  using (
    owner_id = auth.uid()
    or email = (select email from auth.users where id = auth.uid())
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Donos de projetos ou admins podem gerenciar membros da equipe"
  on public.team_members for all
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- 5. ÍNDICES DE PERFORMANCE
create index if not exists idx_team_members_owner_id on public.team_members(owner_id);
create index if not exists idx_team_members_email on public.team_members(email);
