-- Adiciona as colunas `nome` e `email` à tabela public.profiles.
--
-- Motivo: o módulo Central de Acesso (AcessoModule) consulta
--   profiles.nome e profiles.email (tanto na listagem de colaboradores da
--   agência quanto no join com project_users). Essas colunas nunca existiram
--   no schema, e o PostgREST respondia com 400 (Bad Request) — o que gerava a
--   mensagem "Erro ao carregar colaboradores do projeto" na interface.
--
-- Estratégia: desnormalizar nome/email para dentro de profiles (o e-mail
-- canônico vive em auth.users, que não é acessível diretamente via
-- select/RLS do cliente) e manter os dados sincronizados no cadastro de
-- novos usuários através do trigger handle_new_user.

-- 1. Adicionar as colunas (idempotente)
alter table public.profiles
  add column if not exists nome text,
  add column if not exists email text;

-- 2. Backfill dos perfis já existentes a partir do auth.users
update public.profiles p
set
  email = u.email,
  nome = coalesce(
    p.nome,
    u.raw_user_meta_data ->> 'nome',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'full_name',
    split_part(u.email, '@', 1)
  )
from auth.users u
where p.id = u.id
  and (p.email is null or p.nome is null);

-- 3. Atualizar o trigger de criação de perfil para popular nome e email
--    a cada novo cadastro (SECURITY DEFINER, roda como postgres).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, plan, max_projects, email, nome)
  values (
    new.id,
    'client',
    'free',
    2,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'nome',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
