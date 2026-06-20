-- ════════════════════════════════════════════════
-- MIGRATION: GOOGLE CALENDAR OAUTH TOKENS & COLUMNS
-- ════════════════════════════════════════════════

-- 1. Criar tabela para armazenar tokens do Google OAuth por usuário
create table if not exists public.user_google_tokens (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Habilitar RLS na tabela de tokens
alter table public.user_google_tokens enable row level security;

-- Remover políticas antigas se existirem
drop policy if exists "Usuários podem gerenciar seu próprio token" on public.user_google_tokens;

-- Política de acesso aos tokens (apenas o próprio usuário e admins leem/escrevem)
create policy "Usuários podem gerenciar seu próprio token"
  on public.user_google_tokens for all
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 2. Estender a tabela de eventos do calendário
alter table public.calendar_events 
  add column if not exists gcal_event_id text,
  add column if not exists attendees text[] default '{}'::text[];
