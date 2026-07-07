-- ============================================================================
-- CLAVE — Migração: Coluna Tag no Briefing e Links Úteis no Lançamento
-- Versão 1.1 — Julho de 2026
-- ============================================================================

alter table public.briefings add column if not exists tag text;
alter table public.briefings add column if not exists dores_principais text;
alter table public.lancamentos add column if not exists links jsonb default '[]'::jsonb;
