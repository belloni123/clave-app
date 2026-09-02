# PRD técnico — Publicação Meta no módulo Instagram

**Produto:** Clave
**Data da revisão:** 01/09/2026
**Status:** Em implementação, desabilitado por padrão

## 1. Estado atual encontrado

O Clave já possui Instagram Analytics por projeto, uma conta profissional por
projeto, OAuth oficial da Meta, token protegido no Supabase Vault, sincronização
manual e diária e autorização baseada no módulo `instagram`.

Arquivos analisados antes da implementação:

- `components/modules/InstagramModule.tsx`
- `components/AppShell.tsx`
- `store/useAppStore.ts`
- `app/page.tsx`
- `app/api/instagram/*`
- `app/api/cron/instagram-sync/route.ts`
- `utils/instagram/*`
- `types/instagram.ts`
- migrations de Instagram Analytics
- `README.md`, `ARCHITECTURE.md`, `DATABASE.md`, `DEPLOYMENT.md` e `AGENTS.md`
- documentação do Next.js 16.2.11 em `node_modules/next/dist/docs/`

O Analytics existente é parte protegida do escopo. Esta fase não altera seus
cálculos, snapshots, cron ou experiência inicial.

## 2. Escopo desta fase

Redes funcionais:

- Instagram profissional;
- Facebook Pages.

Operações:

- rascunho;
- publicação imediata;
- agendamento no fuso `America/Sao_Paulo`;
- imagem única;
- carrossel;
- vídeo e Reels somente quando as capacidades oficiais permitirem;
- legenda-base e texto específico por rede;
- lista, calendário, detalhes, edição, cancelamento e retry seguro;
- status geral derivado do status de cada destino.

Fora do escopo: aprovação de cliente, Threads, LinkedIn, TikTok, perfil pessoal
do Facebook, Stories, scraping, automação de navegador e APIs privadas.

## 3. Produto e navegação

O item lateral continua sendo `Instagram`. O Analytics continua sendo a visão
inicial. O botão principal `Agendar post` entra no cabeçalho da conta, antes dos
filtros de 7, 30 e 90 dias, e aparece somente quando o servidor retorna
`canManage=true` e a feature flag sanitizada está habilitada.

As visões internas usam URL recuperável dentro do `AppShell`:

- `instagramView=analytics`;
- `instagramView=novo-post`;
- `instagramView=agendamentos`;
- `instagramView=detalhes&postId=<uuid>`.

A implementação deve preservar voltar/avançar, reload e link direto. Parâmetros
transitórios do OAuth podem ser removidos depois do consumo; os parâmetros de
navegação interna não podem ser apagados pelo `AppShell`.

## 4. Autorização e conexão Meta

Documentação oficial consultada em 01/09/2026:

- [Instagram Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing): conta profissional, containers, `media_publish`, carrossel de até 10 itens, status assíncrono, JPEG como único formato de imagem e consulta de limite;
- [IG User Content Publishing Limit](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit): `quota_usage` e `config.quota_total`;
- [Pages API Posts](https://developers.facebook.com/documentation/pages-api/posts): publicação em `/feed` e `/photos` com token de Página;
- [Facebook Reels Publishing](https://developers.facebook.com/documentation/video-api/guides/reels-publishing): fluxo `video_reels` em fases e limite próprio;
- [Graph API v26.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version26.0/): versão lançada em 29/07/2026.

Toda leitura exige acesso ao módulo `instagram`. Toda mutação exige
`user_can_administer_project`. O servidor repete a autorização em cada rota;
ocultar controles no cliente não constitui autorização.

`instagram_connections` permanece como conexão fonte do Instagram Analytics.
`social_connections.source_connection_id` a referencia, evitando duplicar o
token. Uma reautorização para publicação da mesma identidade atualiza a
credencial de forma atômica e preserva todos os snapshots. Trocar de identidade
continua sendo uma operação explícita e separada.

Permissões a confirmar novamente no App Dashboard antes do teste real:

- fluxo atual com Facebook Login: `instagram_basic`,
  `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`,
  `pages_read_engagement` e `pages_manage_posts`, conforme as redes habilitadas.
  Na Graph API v26, `pages_read_user_engagement` e `publish_video` são rejeitadas
  pelo OAuth. `pages_manage_engagement` também não pertence a esta fase e
  aciona a dependência implícita `pages_read_user_content` no diálogo da Meta;
  vídeos de Página usam `pages_manage_posts`;
- `business_management` no modo de BM central;
- tarefas da Página que incluam criação de conteúdo;
- permissões adicionais de vídeo somente se a versão oficial exigir.

A Graph API configurada atualmente é v26.0. Ela foi confirmada como versão
lançada em 29/07/2026. Endpoints e permissões ainda devem ser reconfirmados no
App Dashboard antes de qualquer teste real; a implementação nunca assume que
App Review ou acesso avançado já foram concedidos.

## 5. Modelo de dados

A migration é aditiva e cria:

- `social_connections`: referência à conexão Meta existente;
- `social_accounts`: Instagram profissional e Facebook Pages selecionáveis;
- `social_posts`: conteúdo comum e agendamento;
- `social_post_targets`: estado independente por destino;
- `social_post_media`: metadados e ordem das mídias;
- `social_publish_attempts`: auditoria operacional sem payload sensível;
- RPC de claim com `FOR UPDATE SKIP LOCKED`, lote, lease e worker;
- bucket privado `social-publishing` e políticas por projeto.

As tabelas são server-only: RLS habilitado, privilégios removidos de `anon` e
`authenticated` e acesso de dados concedido apenas a `service_role`. As rotas
autenticadas funcionam como a camada de aplicação e validam usuário/projeto.

Nenhum token, cookie, cabeçalho Authorization ou payload externo sensível é
gravado nas tabelas de publicação ou nos logs.

## 6. Mídia

O navegador solicita um caminho autorizado, envia diretamente ao bucket privado
e confirma o upload. Arquivos grandes não atravessam a memória do processo
Next.js. O caminho começa com o `project_id` e usa identificadores aleatórios;
arquivos não são sobrescritos.

O servidor valida extensão, MIME, tamanho, quantidade e coerência com as
capacidades dos destinos. Imagens e vídeos só seguem para publicação depois da
validação de metadados. A URL assinada para consumo externo é gerada pelo worker
próximo do processamento e possui validade suficiente para o container remoto.

## 7. Providers e capacidades

As regras ficam em `utils/social`, não nos componentes. Cada provider expõe:

- capacidades;
- validação do rascunho;
- publicação;
- consulta de status quando aplicável;
- normalização de erros.

Instagram usa criação de container, espera de processamento e
`media_publish`. Facebook Pages usa token de Página derivado da autorização e o
endpoint oficial compatível com texto, link, foto, múltiplas fotos ou vídeo.
Incompatibilidades são apresentadas antes do agendamento; conteúdo não é
adaptado silenciosamente.

## 8. Executor, idempotência e status

`Publicar agora` e `Agendar` persistem primeiro o post e os destinos. O executor
reivindica destinos vencidos atomicamente. Publicação imediata pode disparar o
mesmo executor após o commit, e o cron continua sendo o mecanismo de recuperação.

O worker usa lote pequeno, `worker_id`, `locked_until`, timeout, concorrência
limitada, backoff e `Retry-After`. Erros permanentes falham sem retry automático.
Timeout depois de uma chamada potencialmente aceita vira `unknown`; não ocorre
nova publicação cega.

Cada tentativa possui registro sanitizado. IDs de container, post remoto e URL
remota são armazenados por destino. O estado geral do post é derivado dos
destinos, inclusive `partially_published`.

## 9. Segurança

- token reutilizado de `instagram_connections.token_secret_id` no Vault;
- `service_role` somente em módulos `server-only`;
- feature flags ausentes significam desabilitado;
- OAuth com `state` HttpOnly e atualização atômica;
- mensagens públicas sem stack trace;
- códigos e eventos integrados ao monitoramento administrativo;
- nenhuma credencial em `localStorage` ou variável `NEXT_PUBLIC_*`;
- mídia privada e URLs temporárias;
- logs com redaction.

## 10. Feature flags e operação

Defaults seguros:

```env
SOCIAL_PUBLISHING_ENABLED=false
SOCIAL_FACEBOOK_ENABLED=false
SOCIAL_INSTAGRAM_PUBLISHING_ENABLED=false
SOCIAL_CRON_SECRET=
```

Somente valores sanitizados chegam ao cliente. Nenhuma flag ou segredo será
alterado em produção nesta implementação.

O Coolify deverá chamar `POST /api/cron/social-publish` a cada minuto usando
`Authorization: Bearer <SOCIAL_CRON_SECRET>`. Isso é documentação futura; esta
fase não configura o Coolify nem faz deploy.

## 11. Testes e critérios de aceite

Serão adicionados testes unitários e de integração com chamadas Meta mockadas
para autorização, capabilities, fuso, status, idempotência, claim, lease, erro
transitório, erro permanente, sucesso parcial, retry seguro e preservação do
Analytics. A UI será validada com teclado e nos viewports solicitados.

Testes com Supabase e Meta reais ocorrerão somente em ambiente local/staging
isolado, com projeto e contas de teste, depois de revisão humana da migration.
Dados de produção não serão usados.

## 12. Migração e rollback

1. Revisar a migration e executar em banco local descartável.
2. Rodar advisors e testes de autorização.
3. Fazer backup e aplicar primeiro em staging.
4. Manter todas as flags desligadas.
5. Testar uma conta controlada e um post não sensível.
6. Ativar uma rede por vez somente após App Review.

Rollback da aplicação consiste em desligar as flags e restaurar a versão
anterior. As tabelas novas permanecem preservadas; não se apagam publicações ou
tentativas durante rollback. Uma eventual remoção futura deve ocorrer por nova
migration deliberada.

## 13. Fases futuras

Threads, LinkedIn, TikTok, aprovação de cliente, Stories, colaboração, música,
produtos, enquetes e recursos editoriais sem API oficial permanecem fora desta
fase.
