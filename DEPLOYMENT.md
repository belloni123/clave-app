# Clave App - Implantação e Redeploy

Este guia descreve o processo de implantação do Clave com Next.js standalone,
Supabase e Docker/Coolify. O banco e a aplicação têm ciclos separados: publicar
uma imagem não aplica migrações no Supabase.

## 1. Variáveis de Ambiente

| Variável | Obrigatória | Escopo | Descrição |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Frontend e backend | URL pública da API do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Frontend e backend | Chave anônima pública; a autorização real é feita por Auth + RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Somente backend/runtime | Chave administrativa usada exclusivamente para convidar usuários e sincronizar seus vínculos. |
| `GEMINI_API_KEY` | Produção | Somente backend | Chave da API Gemini usada pela rota de IA. |
| `SUPABASE_MANAGEMENT_ACCESS_TOKEN` | SMTP | Somente backend/runtime | Token da Supabase Management API usado exclusivamente para sincronizar o SMTP do Supabase Auth. Nunca use `NEXT_PUBLIC_`. |
| `SUPABASE_PROJECT_REF` | Opcional | Somente backend/runtime | Referência do projeto Supabase. Se omitida, é derivada de `NEXT_PUBLIC_SUPABASE_URL`. |

`SUPABASE_SERVICE_ROLE_KEY` nunca pode usar o prefixo `NEXT_PUBLIC_`, ficar
disponível durante o build ou ser enviada ao navegador. A rota de convite
primeiro autentica o operador e valida a administração do projeto antes de
criar ou vincular qualquer conta.

## 2. Ordem Das Migrações

As migrações da integração de BI devem existir no Supabase nesta ordem:

1. `20260723000000_launch_bi_integrations.sql`
2. `20260723010000_launch_bi_management_permissions.sql`
3. `20260723020000_launch_bi_scope_integrity.sql`
4. `20260723030000_external_dashboard_links.sql`
5. `20260723110000_farol_e_forja_dashboard.sql`
6. `20260723120000_auto_dashboard_discovery.sql`
7. `20260723150322_launch_bi_standard_guardrails.sql`
8. `20260730190000_project_modules_communication_products_chip_events.sql`
9. `20260730200000_security_definer_hardening.sql`
10. `20260730231015_user_invites_and_profile_contact_fields.sql`
11. `20260731141454_smtp_settings_and_admin_controls.sql`
12. `20260731160000_temporary_password_invites.sql`

A terceira migração valida os registros existentes antes de criar constraints
compostas. Se ela acusar referências inconsistentes, não faça o redeploy: corrija
os registros indicados e execute a migração novamente. Uma execução bem-sucedida
no SQL Editor mostra `Success. No rows returned`.

A quarta migração permite cadastrar uma URL externa por lançamento. A quinta
habilita o conector do dashboard Farol e a Forja. A sexta substitui o cadastro
individual por detecção automática para dashboards B16. O padrão recomendado é
o contrato completo do Cromador Pro; o contrato simples Meta Ads + Tamborete
Silver permanece como fallback para dashboards antigos ou parciais. A sétima torna a URL do dashboard única por
lançamento e valida o contrato de provider/URL/código para impedir reutilização
acidental de dashboards entre projetos. Todas preservam dados, snapshots e
permissões.

### Contrato Para Novos Dashboards

Para um novo dashboard funcionar completo, no mesmo padrão do Cromador Pro, o
HTML público deve declarar estas constantes JavaScript:

```js
const WORKER_URL = 'https://nome-do-worker.workers.dev';
const SHEET_META = 'nome_da_aba_meta';
const SHEET_GOOGLE = 'nome_da_aba_google_ads';
const SHEET_WP = 'nome_da_aba_leads_elementor';
const SHEET_PLAN = 'nome_da_aba_planejamento';
const SHEET_KIWIFY = 'nome_da_aba_vendas';
const LANCAMENTO_ATIVO = 'codigo-do-lancamento';
const PRODUTO_EXATO = 'Nome exato do produto principal';
const TICKET = 797;
const CNP_TAG = '[TAG]';
```

O Worker precisa aceitar o nome da aba no parâmetro `sheet` e o código do
lançamento no parâmetro `lancamento`. O CSV de Meta deve conter `Date`,
`Campaign Name` e `Spend (Cost, Amount Spent)`. O CSV de Google deve conter
`Date (Segment)` ou `Date` e `Cost (Spend, Amount Spent)` ou `Cost`. O CSV de
leads deve conter `Nome*`, `Created At`, `utm_source`, `utm_medium` e
`atualizado_em`. O CSV de planejamento deve conter `Fase`, `TAG CAMPANHA` e
`Meta`. O CSV de vendas deve conter `Data Criacao`, `Product_product_name`,
`order_ref`, `order_status` e `Faturamento`.

Como fallback, dashboards simples ainda podem declarar apenas:

```js
const WORKER_URL = 'https://nome-do-worker.workers.dev';
const SHEET_META = 'nome_da_aba_meta';
const SHEET_TAMB = 'nome_da_aba_vendas_tamborete';
```

Nesse modo simples, o Clave exibe investimento, vendas, faturamento, CAC e ROAS,
mas não exibe leads, CPL real nem planejamento por etapa.

Com esse contrato, não há cadastro de cliente no código: cada URL informa sua
própria fonte, e o Clave valida e descobre a integração no primeiro clique.

### Padrão Por Projeto e Lançamento

- Cada lançamento possui no máximo uma integração de BI ativa.
- Cada URL de dashboard de BI pode pertencer a apenas um lançamento.
- Dashboards em `suporteb16-collab.github.io` que seguem o contrato completo
  usam `auto_dashboard` e sincronizam automaticamente com leads, CPL e etapas.
- URLs HTTPS fora do contrato ficam como `external_dashboard`: são salvas por
lançamento, mas não exibem métricas automáticas.

A oitava migração preserva os acessos existentes liberando inicialmente todos
os módulos, copia a Comunicação antiga para `Produto principal`, importa o
histórico JSON dos chips para `chip_events` e só então ativa os novos triggers.
Ela deve ser aplicada antes de publicar a interface que consulta essas tabelas.
A nona migração remove exposição RPC desnecessária de triggers e fixa o
`search_path` das funções legadas apontadas pelo advisor de segurança.
A décima documenta nome/e-mail em `profiles`, sincroniza novos usuários do Auth
e preserva o ator da auditoria quando o vínculo é criado pela rota do servidor.
- O dashboard legado `dashboard-b16-cnp0426` é exclusivo do lançamento
  `CNP 2 - 2026` com código `0726`.
- Lançamentos novos começam sem dashboard herdado. O gestor deve colar a URL
  própria daquele lançamento no painel `Dados do BI`.

### SMTP Global Do Clave

A tela `Administração > Configurações` é global e só aparece para perfis
administrativos. A leitura exige perfil `admin` (ou `agency_role = admin`) e a
alteração/teste exige, além disso, o e-mail autenticado
`felipe@agenciab16.com.br` ou `contato@agenciab16.com.br`.

O campo de senha nunca é devolvido ao navegador nem salvo em texto aberto. A
senha de aplicativo do Google Workspace é guardada no Supabase Vault, enquanto
`public.smtp_settings` armazena apenas metadados e o identificador do segredo.
Ao salvar, o backend sincroniza o SMTP no Supabase Auth pela Management API; isso
é o que habilita recuperação de senha, convites e futuras mensagens de Auth.
O mesmo salvamento aplica o modelo de recuperação de senha do Clave em PT-BR.
Depois de publicar uma mudança nesse modelo, salve novamente o SMTP para que o
Supabase Auth receba a atualização.

Antes de usar a tela, crie um token pessoal na conta Supabase e cadastre-o como
segredo de runtime no Coolify:

```text
SUPABASE_MANAGEMENT_ACCESS_TOKEN=<token da Supabase Management API>
SUPABASE_PROJECT_REF=qvmubgtwtaadepkghwny
```

Nunca coloque esse token, a senha de aplicativo ou qualquer variável secreta no
Git, em `NEXT_PUBLIC_*` ou no chat. Para Google Workspace, prefira uma senha de
aplicativo, use SSL na porta 465 ou STARTTLS na porta 587 e confira se o
endereço remetente está autorizado como conta ou alias do usuário SMTP.

## 3. Checklist Antes Do Redeploy

Execute em uma cópia limpa da branch que será publicada:

```bash
npm ci
npm run audit:prod
npm run typecheck
npm run build
```

Como o Next.js incorpora variáveis `NEXT_PUBLIC_*` no bundle, passe a URL e a
chave anônima também como argumentos públicos durante o build da imagem:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t clave-app:release .
```

Critérios para avançar:

- `npm audit` sem vulnerabilidades de produção;
- TypeScript e build Next.js concluídos;
- imagem Docker construída com sucesso;
- migrações do Supabase aplicadas na ordem acima;
- pull request revisado e checks do GitHub verdes;
- nenhuma chave ou arquivo `.env` presente no commit.

## 4. Docker Standalone

O `Dockerfile` usa três estágios: dependências com `npm ci`, build standalone e
runtime mínimo. O processo final roda como usuário sem privilégios e possui
healthcheck em `/api/health`.

```bash
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL="https://seu-projeto.supabase.co" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-anon-key" \
  -e SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key" \
  -e GEMINI_API_KEY="sua-gemini-key" \
  clave-app:release
```

Validação local:

```bash
curl --fail http://127.0.0.1:3000/api/health
```

Resposta esperada: `{"status":"ok"}`.

## 5. Redeploy No Coolify

1. Confirme que o repositório é `belloni123/clave-app` e que a branch de
   produção é `main`.
2. Faça merge do pull request somente depois dos checks verdes.
3. Confirme as variáveis de ambiente da seção 1.
4. Marque `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` como
   disponíveis durante o build e durante o runtime.
5. Mantenha `SUPABASE_SERVICE_ROLE_KEY` e `GEMINI_API_KEY` somente no runtime,
   com a opção de build desmarcada.
6. No Supabase Auth > URL Configuration, defina a **Site URL** como
   `https://clave.agenciab16.com.br` e permita
   `https://clave.agenciab16.com.br/auth/callback` e
   `https://clave.agenciab16.com.br/definir-senha` como URLs de
   redirecionamento. Não mantenha `0.0.0.0`, `localhost` ou a porta interna do
   container como Site URL de produção. Mantenha também um SMTP apto a enviar
   convites aos usuários finais. A Central de acesso permite informar uma senha
   temporária ou deixar o campo vazio para o servidor gerar uma senha forte. O
   convite personalizado envia a senha e o link de ativação; a troca da senha é
   obrigatória no primeiro acesso.
7. Cadastre `SUPABASE_MANAGEMENT_ACCESS_TOKEN` somente no runtime do Coolify;
   mantenha `SUPABASE_PROJECT_REF` como runtime ou deixe o sistema derivá-lo.
8. Use o `Dockerfile` da raiz e porta `3000`.
9. Dispare o redeploy manual no Coolify.
10. Aguarde o healthcheck ficar saudável antes de encerrar a versão anterior.

Este repositório não executa ações no Coolify automaticamente. O redeploy é uma
operação manual do responsável pelo ambiente.

## 6. Validação Pós-Deploy

1. Abra `/api/health` e confirme HTTP 200.
2. Faça login nos temas claro e escuro.
3. Abra Lançamentos > `CNP 2 - 2026`.
4. Confirme que o painel mantém os últimos dados sincronizados.
5. Clique em `Atualizar dados` com um usuário gestor e confirme o novo horário.
6. Confirme que um usuário viewer consegue ler, mas não sincronizar.
7. Em outro lançamento, salve uma URL HTTPS de dashboard externo e confirme que
   ela permanece vinculada somente a esse lançamento, sem mostrar métricas da CNP 2.
8. Verifique os logs do container para erros `5xx` ou falhas de healthcheck.
9. Atualize a página em um projeto diferente do primeiro e confirme que a seleção permanece.
10. Em Central de acesso, limite um usuário de teste ao Controle de Chips e confirme menu e RLS.
11. Confirme que somente o Dashboard e o Controle de Chips ficam visíveis naquele projeto.
12. Convide um e-mail de teste, verifique o recebimento da senha temporária e do
   link de ativação, abra o link e defina a senha pessoal obrigatória.
13. Em Comunicação, abra `Produto principal`, crie outro produto e confirme que os campos não se misturam.
14. Em Chips, altere um status para `Restrição 24h`, volte para `Ativo` e confirme os dois eventos com horário.
15. Informe última recarga e ciclo; confirme a data gerada em Próx. Recarga e o alerta correspondente.
16. Como administrador, abra `Administração > Configurações`, confirme que a senha aparece apenas como protegida e envie um teste para o e-mail autorizado.
17. Salve uma alteração SMTP e confirme que recuperação de senha e convite chegam pelo Google Workspace.
18. Em Central de acesso, use a ação de chave de um usuário ativo e confirme o
    recebimento das novas credenciais e a troca obrigatória de senha no próximo login.
19. Acesse com um administrador fora da allowlist e confirme que a tela fica somente leitura; com um usuário comum, confirme que o menu e a API respondem sem acesso.

## 7. Rollback

Se a aplicação falhar, restaure no Coolify a imagem ou commit anterior. As
constraints da terceira migração são compatíveis com a versão anterior e não
precisam ser removidas durante um rollback da aplicação.

Não reverta migrações apagando tabelas ou snapshots. Caso seja necessário
alterar o banco, faça uma nova migração revisada e preserve o histórico.

## 8. Vercel

Na Vercel, conecte o mesmo repositório, configure as variáveis da seção 1 e use
o fluxo padrão de build do Next.js. As migrações do Supabase continuam sendo um
passo separado e obrigatório antes da promoção para produção.
