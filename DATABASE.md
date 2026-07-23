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
*   `agency_id`: `uuid` (Agência à qual o perfil pertence).
*   `agency_role`: `text` (`'admin'`, `'gestor'` ou `'colaborador'`).

### `public.projects`
Representa os projetos cadastrados. Cada projeto atua como um **Tenant** lógico isolado.
*   `id`: `uuid` (Chave Primária).
*   `user_id`: `uuid` (Referencia `public.profiles.id`, o dono do projeto).
*   `name`: `text` (Nome do projeto/empresa).
*   `color`: `text` (Cor representativa em formato HEX para a interface).
*   `level`: `text` (Nível de faturamento do projeto: `'newbie'`, `'soft'`, `'hard'`, `'pro'`, `'master'`).
*   `created_at`, `updated_at`, `deleted_at`: `timestamp`.
*   `agency_id`: `uuid` (Tenant de agência ao qual o projeto pertence).

### `public.project_users`
Define o acesso atual de cada perfil a um projeto.
*   `project_id`, `user_id`: relação única entre projeto e perfil.
*   `permission_level`: `'viewer'`, `'editor'` ou `'admin'`.
*   `ativo`: indica se o acesso continua válido.

### `public.lancamentos`
Representa um lançamento dentro de um projeto.
*   `project_id`: projeto proprietário e escopo de RLS.
*   `nome`: nome do lançamento.
*   `template`: `'lancamento'`, `'evento_pago'` ou `'pico_perpetuo'`.
*   `criado_por`, `atualizado_por`: responsáveis pelas alterações.

### `public.launch_bi_integrations`
Mantém uma configuração de BI por lançamento.
*   `lancamento_id`, `project_id`: relação protegida por foreign key composta.
*   `provider`: `'b16_dashboard'`, `'auto_dashboard'`, `'external_dashboard'`
    ou o legado `'farol_e_forja_dashboard'`.
*   `dashboard_url`, `external_launch_code`: origem e código externo validados.
*   `period_start`, `period_end`: janela da sincronização.
*   `status`, `last_synced_at`, `last_error`, `last_snapshot`: estado atual.
*   `dashboard_url` é único no banco: o mesmo BI não pode ser vinculado a dois
    lançamentos.
*   O provider precisa respeitar seu contrato: `b16_dashboard` é reservado ao
    CNP 2 - 2026 (`0726`), `auto_dashboard` usa dashboards públicos B16 com
    descoberta automática, e `external_dashboard` é apenas link salvo sem
    snapshot automático.
*   Uma ausência de linha nesta tabela significa que o lançamento ainda não
    possui dashboard conectado; não há configuração padrão compartilhada entre
    lançamentos.

### `public.launch_bi_snapshots`
Histórico auditável das sincronizações do BI.
*   `integration_id`, `lancamento_id`, `project_id`: relação composta com a integração.
*   `metrics`: payload JSONB normalizado pelo conector.
*   `source_updated_at`, `synced_by`, `synced_at`: origem e auditoria.

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

### Políticas do BI

*   **Leitura**: qualquer perfil com acesso ativo ao projeto pode consultar a
    configuração e os snapshots.
*   **Escrita**: somente administrador do sistema, administrador/gestor da
    agência correspondente, dono do projeto ou membro `editor`/`admin` ativo.
*   **Integridade**: constraints compostas impedem que uma linha use o
    `project_id` de um projeto para referenciar lançamento ou integração de
    outro, inclusive em chamadas diretas à API do Supabase.

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

#### Função `public.user_can_manage_project`:
Centraliza a autorização de escrita das integrações de BI. Ela considera
administrador do sistema, gestor/admin da agência, dono do projeto e membros
ativos com permissão `editor` ou `admin`. A função não substitui as constraints
relacionais: autorização do usuário e integridade dos objetos são controles
independentes.

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

---

## 4. Migrações Da Integração De BI

As migrações devem ser aplicadas em ordem crescente:

1. `20260723000000_launch_bi_integrations.sql`: tabelas, índices e RLS inicial.
2. `20260723010000_launch_bi_management_permissions.sql`: separa leitura e
   escrita e cria `user_can_manage_project`.
3. `20260723020000_launch_bi_scope_integrity.sql`: valida os dados existentes e
   cria foreign keys compostas para o isolamento entre projetos.

O deploy da aplicação não executa essas migrações. Consulte
[DEPLOYMENT.md](./DEPLOYMENT.md) para o procedimento de produção.
