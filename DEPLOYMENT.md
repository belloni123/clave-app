# Clave App - Implantação e Redeploy

Este guia descreve o processo de implantação do Clave com Next.js standalone,
Supabase e Docker/Coolify. O banco e a aplicação têm ciclos separados: publicar
uma imagem não aplica migrações no Supabase.

## 1. Variáveis de Ambiente

| Variável | Obrigatória | Escopo | Descrição |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Frontend e backend | URL pública da API do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Frontend e backend | Chave anônima pública; a autorização real é feita por Auth + RLS. |
| `GEMINI_API_KEY` | Produção | Somente backend | Chave da API Gemini usada pela rota de IA. |

O runtime não usa `SUPABASE_SERVICE_ROLE_KEY`. Não configure essa chave no
Coolify. Scripts administrativos locais podem pedi-la explicitamente, mas ela
deve permanecer em um arquivo ignorado e nunca ser exposta ao navegador.

## 2. Ordem Das Migrações

As migrações da integração de BI devem existir no Supabase nesta ordem:

1. `20260723000000_launch_bi_integrations.sql`
2. `20260723010000_launch_bi_management_permissions.sql`
3. `20260723020000_launch_bi_scope_integrity.sql`
4. `20260723030000_external_dashboard_links.sql`
5. `20260723110000_farol_e_forja_dashboard.sql`
6. `20260723120000_auto_dashboard_discovery.sql`
7. `20260723150322_launch_bi_standard_guardrails.sql`

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
- O dashboard legado `dashboard-b16-cnp0426` é exclusivo do lançamento
  `CNP 2 - 2026` com código `0726`.
- Lançamentos novos começam sem dashboard herdado. O gestor deve colar a URL
  própria daquele lançamento no painel `Dados do BI`.

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
3. Confirme as três variáveis de ambiente da seção 1. Não adicione service role.
4. Marque `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` como
   disponíveis durante o build e durante o runtime.
5. Use o `Dockerfile` da raiz e porta `3000`.
6. Dispare o redeploy manual no Coolify.
7. Aguarde o healthcheck ficar saudável antes de encerrar a versão anterior.

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
