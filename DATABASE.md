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
*   `nome`, `email`: identificação sincronizada com `auth.users` e usada no cadastro de acessos por projeto.
*   `must_change_password`: marcador interno que impede o uso normal da conta até a troca da senha temporária; a alteração é feita somente pelo backend.
*   `created_at`, `updated_at`: `timestamp`.
*   `agency_id`: `uuid` (Agência à qual o perfil pertence).
*   `agency_role`: `text` (`'admin'`, `'gestor'` ou `'colaborador'`).

### `public.smtp_settings`
Configuração global do SMTP usado pelo Clave e sincronizado com o Supabase Auth.
Existe uma única linha (`id = true`) e ela não pertence a um projeto.
*   `domain`, `support_whatsapp`, `tutorial_url`: metadados exibidos na área administrativa.
*   `smtp_host`, `smtp_port`, `smtp_security`, `smtp_user`: conexão Google Workspace.
*   `smtp_sender_name`, `smtp_sender_email`: identidade das mensagens enviadas.
*   `smtp_password_secret_id`: referência ao segredo criptografado no Supabase Vault; nunca é a senha.
*   `auth_configured_at`, `last_tested_at`, `last_test_status`, `last_test_error`: estado da sincronização e do teste.
*   `updated_by`, `created_at`, `updated_at`: auditoria básica.

RLS está habilitado sem políticas para `anon` ou `authenticated`. O acesso é
exclusivo do backend com `service_role`; a senha é lida/escrita por funções
`SECURITY DEFINER` cujo `EXECUTE` também é revogado para os papéis públicos.

### `public.smtp_settings_audit`
Histórico server-side das operações da configuração SMTP.
*   `action`: `save` ou `test`.
*   `actor_id`, `actor_email`: administrador responsável.
*   `details`: host, porta, segurança e resultado sem credenciais.
*   `created_at`: data e hora da operação.

A área fica visível para administradores. Somente os e-mails
`felipe@agenciab16.com.br` e `contato@agenciab16.com.br`, quando também possuem
papel administrativo, podem salvar ou testar.

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
*   `allowed_modules`: `text[]` com os módulos liberados nesse projeto. Os valores válidos são `concepcao`, `comunicacao`, `lancamentos`, `validacao`, `historias`, `financeiro`, `planejador`, `urlbuilder`, `chips`, `formularios` e `acesso`.

### `public.project_forms`
Configuração do briefing geral do cliente, pertencente a um único projeto e
independente dos briefings de cada lançamento.
*   `kind`: atualmente `client_briefing`.
*   `public_token`: UUID exclusivo usado no link compartilhável.
*   `active`, `version`: disponibilidade e versão do formulário.
*   A combinação `(project_id, kind)` é única e novos projetos recebem o briefing por trigger.

### `public.project_form_submissions`
Respostas e rascunhos do briefing geral do cliente, sempre vinculados ao formulário e ao mesmo projeto por foreign key composta.
*   `response_token_hash`: SHA-256 do segredo usado para retomar a resposta; o token original não é persistido.
*   `status`: `draft`, `received`, `reviewing`, `waiting` ou `completed`.
*   `answers`: registro integral por campo da informação fornecida pelo cliente, atualizado no rascunho ou quando a equipe solicita complemento.
*   `internal_notes`, `strategic_summary`: conteúdo interno que nunca é exposto na rota pública.
*   `mapped_fields`, `skipped_fields`: auditoria do espelhamento conservador para campos existentes.

### `public.project_form_attachments`
Metadados das referências visuais privadas enviadas no briefing geral do cliente.
*   Aceita somente JPG, PNG e WebP de até 8 MB.
*   O conteúdo fica no bucket privado `briefing-references`; usuários internos precisam de acesso ao módulo `formularios` e nível de gestão no mesmo projeto.
*   Exclusão em cascata acompanha a resposta e o projeto.

### `public.expert_applications`
Candidaturas públicas de potenciais experts antes de existir um projeto.
*   Dados de contato, contexto de mercado, histórico digital e capacidade de investimento ficam preservados na resposta original.
*   `status`: `new`, `reviewing`, `qualified`, `disqualified` ou `converted`.
*   `idempotency_key`: impede que um envio repetido pelo navegador crie outra candidatura.
*   `lgpd_consent`, `consented_at`: registram a autorização explícita e seu instante.
*   `converted_project_id`, `converted_by`, `converted_at`: auditoria da conversão administrativa em projeto.
*   Não há grants para `anon`; a inclusão pública acontece somente pela API server-side.

### `public.expert_application_rate_limits`
Contador horário usado pela API pública para limitar envios automatizados.
*   `key_hash` é um HMAC irreversível da origem e não armazena o endereço bruto.
*   Somente `service_role` acessa a tabela e executa `consume_expert_application_rate_limit`.

### `public.communication_products`
Catálogo de produtos e cursos dentro de cada projeto.
*   `project_id`: projeto proprietário.
*   `name`: nome exibido na entrada de Comunicação.
*   `archived`: arquivamento lógico.
*   `created_by`, `created_at`, `updated_at`: auditoria.

### `public.communication_product_fields`
Todos os campos das abas de Comunicação, isolados por produto.
*   `product_id`: referencia `communication_products`.
*   `key`, `value`: identificador estável e conteúdo do campo.
*   A combinação `(product_id, key)` é única.
*   A estrutura da VSL usa `vsl-tt` e `vsl-copy`; a validação dos 12 blocos é
    calculada na interface e não exige alteração de schema.

Os créditos de fontes, classificações `[S]`, `[C]`, `[P]` e `[O]` são catálogo
estático da aplicação. Portanto, esta padronização não cria uma migração do
Supabase nem altera dados já salvos nos cursos/produtos.

### `public.chips`
Estado atual de cada chip do projeto.
*   `status`: inclui `Restrição 24h` além dos estados anteriores.
*   `ultima_recarga`, `periodicidade`: base da agenda de recarga.
*   `proxima_recarga`: coluna gerada por `ultima_recarga + periodicidade`.
*   `restricao_24h_ate`: instante agendado para verificar a liberação.

### `public.chip_events`
Histórico normalizado e cronológico dos chips.
*   `event_type`: cadastro, mudança de status, recarga, anotação manual ou evento legado.
*   `previous_status`, `new_status`: transição, quando aplicável.
*   `note`, `occurred_at`, `actor_id`: descrição, data/hora e usuário responsável.
*   `metadata`: dados complementares, como próxima recarga e prazo de verificação.

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
    descoberta automática completa quando o HTML expõe o contrato do Cromador
    Pro, e `external_dashboard` é apenas link salvo sem snapshot automático.
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
1.  **Leitura (SELECT)**: Um projeto só é visível se o usuário for o dono, administrador ou possuir vínculo ativo em `project_users`. `colab_assignments` continua compatível com os vínculos legados.
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

#### Funções de acesso modular:

`public.user_can_administer_project` identifica quem pode gerenciar pessoas e
permissões. `public.user_has_project_module_access` combina esse privilégio com
`project_users.allowed_modules`. As políticas restritivas dos módulos exigem
essa validação além do acesso geral ao projeto.

---

## 3. Triggers do Sistema

### Criação Automática de Perfil (`on_auth_user_created`):
Para garantir consistência e evitar erros onde um usuário cadastrado no Supabase Auth fica sem perfil associado no banco, há um trigger automático pós-cadastro:
```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, plan, max_projects, email, nome)
  values (
    new.id,
    'client',
    'free',
    2,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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
4. `20260730190000_project_modules_communication_products_chip_events.sql`:
   permissões modulares, Comunicação por produto, agenda e eventos dos chips.
5. `20260730200000_security_definer_hardening.sql`: fixa `search_path` e remove
   execução anônima das funções administrativas e de trigger.
6. `20260730231015_user_invites_and_profile_contact_fields.sql`: normaliza
   nome/e-mail dos perfis e auditoria dos convites por projeto.
7. `20260731160000_temporary_password_invites.sql`: adiciona o marcador
   `profiles.must_change_password` para exigir a troca da senha temporária no
   primeiro acesso. A senha em texto aberto não é armazenada no banco.
8. `20260811122408_client_briefing_forms.sql`: cria o briefing geral do cliente por projeto.
9. `20260811125729_expert_applications.sql`: cria candidaturas públicas, proteção de envio e conversão transacional em projeto.
10. `20260811132938_project_forms_policy_performance_hardening.sql`: adiciona índices de escopo e separa políticas de leitura/escrita sem alterar os dados.
11. `20260811133218_public_briefing_submission_rate_limit.sql`: limita a criação de rascunhos públicos com uma chave HMAC por formulário e origem.

O deploy da aplicação não executa essas migrações. Consulte
[DEPLOYMENT.md](./DEPLOYMENT.md) para o procedimento de produção.

A rota pública `/onboarding` é institucional e não possui tabela, função,
política ou migração. Ela não lê nem grava dados no Supabase.
