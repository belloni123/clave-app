# Clave App - Modelo de Banco de Dados e Segurança (RLS)

Este documento descreve a estrutura de tabelas, relacionamentos, triggers e as políticas de segurança a nível de linha (**Row Level Security - RLS**) no banco de dados Supabase (PostgreSQL) da plataforma **Clave**.

---

## 1. Dicionário de Dados (Tabelas)

### `public.profiles`
Armazena as informações adicionais dos usuários autenticados da plataforma.
*   `id`: `uuid` (Chave Primária, referencia `auth.users.id`).
*   `role`: `text` (Tipo de conta: `'admin'`, `'client'`, `'colab'`, `'student'`).
*   `plan`: `text` (Plano de cobrança: `'free'`, `'pro'`, etc).
*   `max_projects`: `integer` (Limite histórico de projetos associados. O sistema agora ignora esse limite no client-side para permitir projetos ilimitados).
*   `created_at`, `updated_at`: `timestamp`.

### `public.projects`
Representa os projetos cadastrados. Cada projeto atua como um **Tenant** lógico isolado.
*   `id`: `uuid` (Chave Primária).
*   `user_id`: `uuid` (Referencia `public.profiles.id`, o dono do projeto).
*   `name`: `text` (Nome do projeto/empresa).
*   `color`: `text` (Cor representativa em formato HEX para a interface).
*   `level`: `text` (Nível de faturamento do projeto: `'newbie'`, `'soft'`, `'hard'`, `'pro'`, `'master'`).
*   `created_at`, `updated_at`, `deleted_at`: `timestamp`.

### `public.colab_assignments`
Define quais colaboradores adicionais possuem acesso a quais projetos.
*   `id`: `uuid` (Chave Primária).
*   `project_id`: `uuid` (Referencia `public.projects.id`).
*   `colab_id`: `uuid` (Referencia `public.profiles.id`, o colaborador atribuído).
*   `created_at`: `timestamp`.

### `public.team_members`
Lista de membros da equipe cadastrados no painel de controle da agência.
*   `id`: `uuid` (Chave Primária).
*   `owner_id`: `uuid` (Dono do registro, referencia `public.profiles.id`).
*   `name`: `text` (Nome do membro).
*   `role`: `text` (Categoria de acesso: equipe, cliente, aluno).
*   `email`: `text` (E-mail para convite).
*   `permissions`: `text[]` (Array contendo identificadores de abas liberadas).

### `public.financial_data`
Dados consolidados de caixa e premissas operacionais do módulo Financeiro.
*   `id`: `uuid` (Chave Primária).
*   `project_id`: `uuid` (Referencia `public.projects.id`).
*   `briefing`: `jsonb` (Perguntas e respostas operacionais do briefing).
*   `params`: `jsonb` (Taxas e premissas gerais de conversão e custos).
*   `offers`: `jsonb` (Lista de ofertas cadastradas com ticket e cancelamento).
*   `investments`: `jsonb` (Lista de investimentos planejados por categoria).
*   `trafego_real`: `numeric` (Tráfego real de visitas).
*   `curCen`: `integer` (Cenário ativo selecionado).

### `public.text_fields`
Armazena textos livres, logs e históricos associados a um projeto de forma genérica.
*   `id`: `uuid` (Chave Primária).
*   `project_id`: `uuid` (Referencia `public.projects.id`).
*   `key`: `text` (Identificador do campo: `'benchmarking'`, `'utm_history'`, etc).
*   `value`: `text` (Conteúdo serializado em texto ou string JSON).

### `public.matrix_answers`
Armazena as respostas da **Matriz do Perpétuo** (18 perguntas).
*   `id`: `uuid` (Chave Primária).
*   `project_id`: `uuid` (Referencia `public.projects.id`).
*   `answers`: `jsonb` (Mapeamento de perguntas e valores selecionados).

---

## 2. Regras de Isolamento Multi-Tenant e Segurança RLS

Para impedir que dados de um cliente vazem para outro, a plataforma tem a segurança RLS habilitada em todas as tabelas transacionais.

### Políticas de Projetos (`public.projects`):
1.  **Leitura (SELECT)**: Um projeto só é visível se o usuário for o dono (`user_id = auth.uid()`), for um administrador do sistema, ou estiver associado na tabela de colaboradores (`colab_assignments`).
2.  **Modificação (ALL)**: Apenas o dono ou um administrador podem deletar, alterar ou criar projetos.

### Prevenção de Loops de Recursão Infinita no Postgres:
Consultar diretamente a tabela `projects` a partir de uma regra RLS da tabela `colab_assignments` (e vice-versa) geraria uma recursão infinita no motor do Postgres (erro `42P17`). 
Para quebrar esse loop, a arquitetura utiliza duas funções auxiliares declaradas como **`SECURITY DEFINER`** (que rodam contornando o RLS com privilégios de administrador do banco):

#### Função `public.is_admin`:
Bypassa a regra RLS e verifica se o ID possui papel administrativo direto.
```sql
create or replace function public.is_admin(usr_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles 
    where id = usr_id and role = 'admin'
  );
end;
$$ language plpgsql security definer;
```

#### Função `public.get_project_owner`:
Retorna o criador de um projeto sem disparar gatilhos recursivos de RLS na tabela `projects`.
```sql
create or replace function public.get_project_owner(proj_id uuid)
returns uuid as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.projects where id = proj_id;
  return owner_id;
end;
$$ language plpgsql security definer;
```

---

## 3. Triggers do Sistema

### Criação Automática de Perfil (`on_auth_user_created`):
Para garantir consistência e evitar erros onde um usuário cadastrado no Supabase Auth fica sem perfil associado no banco, há um trigger automático pós-cadastro:
```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, plan, max_projects)
  values (new.id, 'client', 'free', 2)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```
