# Security Policy

## Supported Version

Security fixes are maintained on the `main` branch. Deployments should use a
reviewed commit from `main` and apply all Supabase migrations tracked in the
repository before the application image is replaced.

## Reporting A Vulnerability

Do not open a public issue with credentials, customer data, or exploit details.
Use GitHub's private vulnerability reporting for this repository so the
maintainers can validate and remediate the report before disclosure.

Include the affected route or file, reproduction preconditions, expected and
observed behavior, and whether any live data was touched. Do not test against
production or another tenant without explicit authorization.

## Secrets

Runtime secrets must stay in the deployment platform or a local ignored
environment file. Never commit `.env*`, service-role keys, API keys, database
passwords, access tokens, or production exports.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and may be used only through
`utils/supabase/admin.ts`. Rotas administrativas devem autenticar o usuário com
`auth.getUser()` e fazer uma autorização explícita antes de criar o cliente
administrativo. A única exceção são rotas públicas baseadas em capacidade,
documentadas abaixo. A chave deve existir somente no runtime do Coolify.

`SUPABASE_MANAGEMENT_ACCESS_TOKEN` is also server-only and runtime-only. It may
only be used by `/api/admin/smtp` after validating an administrator and the
explicit SMTP editor allowlist. SMTP passwords are stored in Supabase Vault;
they must never be logged, returned to the browser, committed, or shared in
chat.

OpenAI e Claude não usam segredos globais do ambiente. As credenciais são
isoladas por projeto em `project_ai_settings` e criptografadas no Supabase
Vault. O navegador recebe somente estado de configuração e os quatro últimos
caracteres; leitura e alteração do segredo exigem uma rota autenticada,
autorização do projeto e `service_role`. Nunca registre prompts completos,
respostas dos provedores ou credenciais em logs de erro.

## Project And Module Isolation

Hiding a navigation item is not an authorization control. Project membership
and module permissions must also be enforced by Supabase RLS. New
project-scoped tables must use `user_has_project_module_access` or an
equivalent hardened `SECURITY DEFINER` helper with an explicit `search_path`.

Only project administrators may write `project_users`. A regular viewer or
editor may read their own membership, but cannot grant access or change
another user's modules.

O bucket `story-audio` é privado e limitado a formatos de áudio permitidos e
25 MB. A RLS valida o projeto derivado do caminho e o acesso ao módulo
`historias`; a gravação também exige que o segundo segmento do caminho seja o
usuário autenticado. A transcrição acontece no navegador em Web Worker e não
envia o áudio para OpenAI, Claude ou para a rota de geração de conteúdo.

`project_client_profiles` is protected by the `cliente` module key. It has no
anonymous grants and its authenticated insert/update policies require both
project-module access and `updated_by = auth.uid()`. The public briefing may
reach this table only through the validated server route and `service_role`;
its conservative mapper fills empty profile/baseline fields and never changes
the current snapshot or overwrites content reviewed by the team.

## Public Form Capabilities

`/api/public/forms/[token]` não aceita sessão como autorização. O UUID do
formulário identifica somente o projeto e permite iniciar uma resposta. Ler ou
alterar um rascunho exige também um token aleatório de 32 bytes; somente seu
hash SHA-256 é persistido. Essas rotas devem validar ambos os tokens antes de
usar `service_role`, limitar tamanho e chaves do payload e nunca devolver notas
internas, resumo, caminhos do Storage ou dados de outra resposta.

Anexos públicos são limitados a cinco imagens JPG, PNG ou WebP de até 8 MB. O
bucket `briefing-references` é privado; a equipe abre arquivos por URL assinada
e somente quando a RLS confirma acesso ao módulo `formularios` e nível de gestão
naquele projeto. Grants por coluna impedem que usuários autenticados alterem as
respostas originais, o resumo ou o histórico de espelhamento pelo cliente REST.

`/api/public/expert-applications` aceita somente a estrutura fechada da
candidatura, limita o corpo, valida todos os campos novamente no servidor e usa
idempotência para impedir duplicação pelo navegador. O endpoint combina
campo-armadilha, tempo mínimo de preenchimento e contador horário por HMAC da
origem; o endereço bruto não é persistido. `anon` não possui acesso à tabela.

Somente administradores podem consultar ou classificar candidaturas. A criação
de projeto ocorre por uma função transacional com `auth.uid()`, checagem de
administrador e bloqueio da resposta. O cliente autenticado só recebe grants de
atualização para `status` e `internal_notes`; vínculo, ator e data da conversão
não podem ser alterados pela API REST.

## Public Institutional Pages

`/onboarding` is intentionally public but contains only versioned institutional
content and optimized local images. It has no form, API call, authentication
state, customer identifier, query-string behavior, or database dependency. Keep
`noindex, nofollow` in its route metadata and do not introduce client-specific
information into this shared page.

`expert_application_rate_limits` intentionally has RLS without a client policy:
all grants are revoked from `anon` and `authenticated`, and only `service_role`
can consume the counter. `can_manage_expert_applications` and
`convert_expert_application_to_project` intentionally remain executable by
`authenticated`; both derive the actor from `auth.uid()`, require an active
administrator and expose no privileged operation to a regular account.

`project_form_rate_limits` follows the same private counter pattern. New public
briefing responses are limited by an HMAC of the form and request origin; the
raw address is never stored. Public JSON routes read their streams with a hard
byte limit even when `Content-Length` is absent, and uploaded images must match
the declared JPG, PNG, or WebP signature before reaching private Storage.

## Error Monitoring

`app_error_events` is an administrative table. `anon` has no privileges and an
authenticated session can read or update it only when the RLS policy confirms
an active profile with `role = admin` or `agency_role = admin`. The browser cannot insert directly; public reports
pass through a size-limited and rate-limited server route using `service_role`.

Monitoring payloads must never contain passwords, access or refresh tokens,
authorization headers, complete form answers, resume URLs, uploaded files or
URL query strings. Store only the minimum identifiers required for support.
The server sanitizes common credential patterns and caps every text field, but
callers remain responsible for passing allowlisted metadata instead of raw
request bodies.

`app_error_event_rate_limits` has RLS enabled without client policies and no
grants for `anon` or `authenticated`. Its `SECURITY DEFINER` function has an
explicit `search_path`, rejects malformed parameters and is executable only by
`service_role`.

Authenticated administrators may update only `status` and `admin_notes`.
`resolved_at` and `resolved_by` are filled by a `SECURITY INVOKER` trigger from
the current authenticated actor, so a REST client cannot forge who resolved an
occurrence.
