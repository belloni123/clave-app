# PRD — Instagram Analytics por Projeto

**Produto:** Clave

**Status:** Implementado

**Data:** 28/08/2026
**Responsável:** Produto e Engenharia Clave

## 1. Visão do produto

Cada projeto do Clave pode conectar uma conta profissional do Instagram e acompanhar, em um painel visual, a evolução da audiência e o desempenho dos conteúdos. A conexão pertence ao projeto — não a um lançamento ou usuário — e os dados históricos continuam disponíveis no Clave após a janela de retenção da API da Meta.

## 2. Problema

Agências e especialistas precisam alternar entre o Clave, o Instagram e planilhas para acompanhar crescimento, alcance, visualizações e conteúdos de destaque. Isso fragmenta a análise e dificulta relacionar a estratégia do projeto com os resultados orgânicos.

## 3. Objetivos

- Permitir uma conta de Instagram por projeto.
- Centralizar os principais indicadores orgânicos em um dashboard responsivo.
- Guardar snapshots diários para criar histórico próprio.
- Comparar períodos e destacar tendências automaticamente.
- Respeitar a separação multi-tenant e as permissões por módulo.
- Deixar preparada a evolução futura para dados pagos da Marketing API.

## 4. Fora do escopo inicial

- Publicação ou agendamento de conteúdo.
- Gestão de comentários ou mensagens.
- Métricas de anúncios, campanhas e investimento da Meta Ads.
- Contas pessoais do Instagram.
- Benchmarking com contas que não autorizaram o Clave.

## 5. Personas e permissões

### Administrador do projeto

- Conecta, reconecta, troca e remove a conta.
- Executa sincronização manual.
- Visualiza todos os dados do painel.

### Colaborador com acesso ao módulo Instagram

- Visualiza o painel e o status da integração.
- Recebe os dados das sincronizações automáticas.
- Não troca nem remove a conta conectada.

### Colaborador sem acesso ao módulo

- Não vê o módulo nem acessa seus dados pela API.

## 6. Regras de negócio

1. Um projeto possui no máximo uma conexão ativa do Instagram.
2. A conta deve ser profissional: Comercial ou Criador de conteúdo.
3. A conta deve estar vinculada a uma Página da BM no fluxo central ou a uma Página administrada pelo usuário no OAuth individual.
4. A conexão é feita por OAuth oficial da Meta; o Clave nunca coleta a senha.
5. O token de acesso é removido imediatamente do fragmento de retorno e armazenado no Supabase Vault.
6. O histórico é segregado por `project_id` em todas as tabelas.
7. Uma sincronização não apaga o último snapshot válido quando a Meta falha.
8. A sincronização automática roda diariamente; a manual informa sucesso ou erro.
9. Métricas ausentes na API são exibidas como indisponíveis, não como zero.
10. Datas da Meta são persistidas em UTC e apresentadas no fuso do usuário.
11. Trocar a conta encerra o vínculo anterior. O histórico anterior é removido junto da conexão para evitar misturar perfis no mesmo projeto.

## 7. Experiência e navegação

O menu lateral recebe o item **Instagram**, no grupo Ferramentas. O módulo possui três estados.

### Sem conexão

- Apresentação do benefício e prévia dos blocos de dados.
- Requisitos claros: conta profissional e autorização da Meta.
- Botão primário “Conectar Instagram”.

### Conectado

- Cabeçalho com foto, nome, `@usuario`, tipo da conta, seguidores, publicações e última sincronização.
- Filtro de período: 7, 30 ou 90 dias.
- Cards: seguidores, crescimento, alcance, visualizações, interações e engajamento.
- Gráfico principal de evolução no período.
- Distribuição de formatos: Reels, feed, carrossel e Stories disponíveis.
- Insights automáticos baseados na comparação entre períodos.
- Ranking visual dos conteúdos, com miniatura e métricas.
- Ações de sincronizar, reconectar e desconectar.

### Erro ou autorização expirada

- Mantém o último dashboard válido.
- Exibe o motivo de forma segura, sem dados técnicos sensíveis.
- Oferece “Reconectar Instagram”.

## 8. Métricas

### Conta

- Seguidores atuais.
- Crescimento absoluto e percentual.
- Novos seguidores e unfollows, quando liberados pela Meta.
- Alcance.
- Visualizações.
- Contas engajadas.
- Interações totais.
- Visitas ao perfil e cliques em links, quando disponíveis.

### Conteúdo

- Visualizações/reproduções.
- Alcance.
- Curtidas.
- Comentários.
- Compartilhamentos.
- Salvamentos.
- Respostas de Stories.
- Tempo médio e total de exibição de Reels, quando disponíveis.

### Indicadores calculados pelo Clave

- Taxa de crescimento = crescimento / seguidores no início do período.
- Taxa de engajamento por alcance = interações / alcance.
- Média de visualizações por conteúdo.
- Participação de cada formato nas visualizações.
- Variação contra o período imediatamente anterior de mesma duração.

## 9. Integração e sincronização

1. O usuário inicia a conexão informando o projeto.
2. O backend valida autenticação e permissão administrativa.
3. Um `state` aleatório é salvo em cookie `HttpOnly` para proteção CSRF.
4. A Meta autentica o administrador e libera os ativos já existentes da BM.
5. O Clave captura o token de longa duração no fragmento, remove-o da URL e
   lista as contas profissionais vinculadas às Páginas autorizadas.
6. O usuário escolhe uma conta para o projeto e o backend guarda o token no Vault.
7. A primeira sincronização importa conta, histórico disponível e até 50 conteúdos recentes.
8. Sincronizações seguintes fazem `upsert` dos snapshots e conteúdos.

## 10. Modelo de dados

- `instagram_connections`: vínculo 1:1, metadados do perfil, status e referência do segredo.
- `instagram_account_daily`: snapshot diário das métricas da conta.
- `instagram_media`: catálogo dos conteúdos recentes.
- `instagram_media_insights`: snapshots diários das métricas por conteúdo.
- `instagram_sync_runs`: auditoria operacional das sincronizações.

## 11. Segurança e privacidade

- Tabelas operacionais são acessadas apenas pelo backend com `service_role`.
- Toda rota valida a sessão real com `auth.getUser()`.
- Toda leitura valida `user_has_project_module_access`.
- Operações de vínculo validam `user_can_administer_project`.
- O seletor alimentado pelo token central da BM é exclusivo de administradores
  globais/da agência. No OAuth individual, as Páginas autorizadas pelo usuário
  são retornadas pelo próprio token do usuário e não expõem ativos de terceiros.
- Tokens são criptografados no Vault.
- O callback correlaciona o `state` com um cookie `HttpOnly`, `Secure` e
  `SameSite=Lax`, expira a tentativa em 15 minutos e remove os cookies ao concluir.
- O token retornado no fragmento oficial da Meta é removido imediatamente da URL,
  enviado ao backend por HTTPS e protegido no Vault após a escolha da conta.
- Solicitações de desautorização e exclusão validam a assinatura HMAC da Meta.
- Revogar o acesso na Meta exclui a conexão, o token e os snapshots relacionados.
- Logs não incluem token, código OAuth ou respostas completas da Meta.

## 12. Configuração necessária

- `META_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `META_APP_ACCESS_TOKEN` (alternativa ao segredo apenas no modo de token central)
- `META_BUSINESS_ID` da BM autorizada
- `META_SYSTEM_USER_TOKEN` do usuário de sistema da BM (modo recomendado)
- `INSTAGRAM_GRAPH_API_VERSION` (opcional; padrão `v26.0`)
- `CRON_SECRET` para a sincronização agendada
- URL de callback cadastrada no Login do Facebook para Empresas: `/instagram/conectar`
- URL de desautorização: `/api/instagram/deauthorize`
- URL de solicitação de exclusão: `/api/instagram/data-deletion`
- Política de privacidade pública: `/privacidade`
- Termos de serviço públicos: `/termos`
- Permissões do OAuth individual: `instagram_basic`, `instagram_manage_insights`,
  `pages_show_list` e `pages_read_engagement`
- Permissão adicional do token central: `business_management`

## 13. Critérios de aceite

- [ ] Um projeto não aceita uma segunda conexão simultânea.
- [ ] Usuário sem acesso ao projeto recebe 403.
- [ ] Colaborador sem o módulo Instagram não visualiza dados.
- [ ] Token nunca aparece no payload da API ou no cliente.
- [ ] A primeira sincronização cria snapshots de conta e conteúdo.
- [ ] O dashboard funciona em desktop e celular, claro e escuro.
- [ ] Trocar o período recalcula cards, gráfico e comparações.
- [ ] Falha da Meta preserva os últimos dados e mostra estado de erro.
- [ ] Desconectar remove segredo, conexão e dados relacionados.
- [ ] Typecheck, lint e testes de unidade passam.

## 14. Evoluções futuras

- Demografia detalhada por idade, gênero, cidade e país.
- Exportação em PDF/CSV e relatórios automáticos.
- Metas mensais e alertas de queda.
- Análise assistida por IA com recomendações editoriais.
- Meta Ads via Marketing API, mantendo orgânico e pago separados.
- Comparação consolidada entre projetos da agência.
