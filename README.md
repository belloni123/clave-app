# Clave - Plataforma de Gestão Estratégica de Marketing

O **Clave** é uma plataforma robusta de gestão estratégica de marketing desenvolvida como um MVP completo em Next.js 16, estilizado com Tailwind CSS v4, gerenciado por Zustand, otimizado com React Query e integrado ao Supabase para Autenticação e Banco de Dados (PostgreSQL) com suporte a Row Level Security (RLS) para isolamento de dados.

---

## 🚀 Documentação Detalhada

Para facilitar o desenvolvimento, a manutenção e o deploy do sistema, a documentação foi modularizada em guias técnicos dedicados:

*   **[Arquitetura do Software (ARCHITECTURE.md)](./ARCHITECTURE.md)**: Explicação sobre a estrutura modular do Next.js, ciclo de vida do estado global no Zustand, fluxo e segurança da IA por projeto e padrões de responsividade UI.
*   **[Modelo de Banco de Dados e Segurança (DATABASE.md)](./DATABASE.md)**: Dicionário de tabelas do banco de dados, mapeamento de chaves estrangeiras, triggers de inicialização de perfil e políticas RLS detalhadas com funções de desvio para evitar recursão infinita.
*   **[Manual de Implantação e Deploy (DEPLOYMENT.md)](./DEPLOYMENT.md)**: Orientações de configuração de variáveis de ambiente e deploy em nuvem através da Vercel, Docker Standalone ou VPS própria via Coolify.
*   **[Política de Segurança (SECURITY.md)](./SECURITY.md)**: Versão suportada, canal privado de reporte e regras para tratamento de segredos.
*   **[Requisitos de julho de 2026](./docs/requirements/2026-07-30-controle-de-acesso-comunicacao-e-chips.md)**: Transcrições e critérios de aceite de acesso modular, Comunicação por produto e Controle de Chips.
*   **[Candidatura de Experts](./docs/requirements/2026-08-11-candidatura-experts.md)**: Fluxo público, avaliação administrativa, privacidade e conversão de lead em projeto.
*   **[Onboarding Público B16](./docs/requirements/2026-08-11-onboarding-publico.md)**: Conteúdo, direção visual, acessibilidade e critérios de validação da experiência pós-contrato.
*   **[Cliente e Evolução](./docs/requirements/2026-08-17-cliente-evolucao.md)**: Escopo consolidado dos áudios, campos do perfil, marco de entrada, cenário atual e integração conservadora com o briefing.
*   **[Monitoramento Administrativo](./docs/requirements/2026-08-17-monitoramento-erros.md)**: Registro seguro de falhas, códigos de suporte, acesso administrativo e fluxo de resolução.
*   **[Banco de Histórias e IA por Projeto](./docs/requirements/2026-08-24-banco-historias-ia-por-projeto.md)**: Entrada por texto ou áudio, transcrição local, armazenamento privado e credenciais OpenAI/Claude isoladas por projeto.
*   **[PRD do Instagram Analytics](./docs/requirements/2026-08-28-instagram-analytics.md)**: Escopo, métricas, segurança, experiência e critérios de aceite da conexão por projeto.

---

## 🛠️ Stack Tecnológica

A stack do projeto garante velocidade de processamento, performance de compilação e isolamento seguro de dados:

*   **Frontend**: Next.js 16 (App Router) + React 19.
*   **Estilização**: Tailwind CSS v4 (com variáveis nativas integradas via `@theme` em `globals.css`).
*   **Estado Global**: Zustand para fluxo reativo leve (sidebar, maturidade do projeto e projetos ativos).
*   **Banco de Dados & Autenticação**: Supabase (PostgreSQL) integrado ao ciclo de Next.js via Cookies (`@supabase/ssr`).
*   **Gerenciamento de Cache**: React Query para sincronização inteligente de dados e invalidação de cache.
*   **Inteligência Artificial**: OpenAI ou Claude, escolhida e financiada por projeto, com credenciais criptografadas no Supabase Vault.
*   **Transcrição local**: Whisper via Transformers.js em Web Worker; não usa créditos de OpenAI ou Claude.
*   **Integração de BI**: Rota server-side para sincronização controlada do dashboard B16 com snapshots históricos no Supabase.

---

## 🌟 Funcionalidades Principais do MVP

A plataforma unifica diversos recursos de controle operacional e estratégico em um painel único:

1.  **Funil de Diagnóstico Público (`/diagnostico`)**: Questionário público para captação de leads. Possui duas trilhas de perguntas interativas passo a passo (uma para *Experts* com 18 etapas e outra para *Profissionais de Bastidores* com 13 etapas), colhendo dados de contato e calculando o nível de maturidade digital correspondente (Fundação, Estruturação, Tração, Expansão, Escala) com CTAs integrados para criação de conta.
2.  **Matriz do Perpétuo**: Painel analítico de viabilidade composto por 18 perguntas estratégicas divididas entre os canais Google Ads e Meta Ads. O sistema indica o canal recomendado e cruza a indicação com o nível de faturamento do projeto, exibindo alertas se o projeto ainda não estiver maduro para receber tráfego pago nos respectivos canais.
3.  **Benchmarking Comparativo**: Permite cadastrar concorrentes direto no módulo de concepção, inserir preços, organizar a lista via Drag & Drop ou ordenar por hierarquia de preço, alimentando o simulador financeiro.
4.  **Simulador Financeiro Unificado (Precificação)**: Ferramenta de modelagem de preços e cálculo de viabilidade integrada ao módulo Financeiro. Permite alternar impostos, taxas e gateways entre valor fixo (R$) e percentual (%), projetando receitas mensais/anuais, margem de contribuição e CPA máximo. Também calcula o **Diagnóstico vs. Mercado** (Abaixo do mercado, Preço ideal ou Acima do mercado) baseado na média cadastrada no Benchmarking.
5.  **Comparador de Cenários**: Salva e compara múltiplos cenários de precificação em tempo real lado a lado, persistindo as informações localmente.
6.  **Planejador Editorial**: Calendário editorial interativo que inclui simulação rápida de sincronização com o Google Calendar.
7.  **Links & QR Code**: Gerador de tags UTM, links rápidos de WhatsApp e conversão em QR Code com opção de download de imagem em alta resolução (600x600px).
8.  **Central de Acesso Multi-usuário**: Cria ou vincula funcionários e clientes por e-mail, envia convite personalizado para contas novas com senha temporária opcional (gerada automaticamente quando omitida), permite copiar a mensagem de acesso para o WhatsApp, trocar a senha temporária ou reenviar o link de login e define os módulos liberados em cada projeto. Ao revogar, a pessoa sai da lista ativa e precisa ser adicionada novamente. O menu e a RLS do Supabase aplicam a mesma regra.
9.  **Lançamentos e Dados do BI**: O planejamento oferece Lançamento Clássico, Evento Pago, Pico + Perpétuo, Evento Presencial, Lançamento Interno e Lançamento Meteórico, cada um com cronograma inicial próprio. O lançamento CNP 2 - 2026 também pode sincronizar investimento, leads, vendas, faturamento, CPL e ROAS a partir do dashboard público da B16.
10. **Comunicação por Produto/Curso**: Cada produto ou curso possui Identidades, Urgências, Bloqueios, VSL e Página de Vendas próprias, incluindo Mecanismo Único, Resultado-Alvo e Benefício Estendido.
11. **Controle Operacional de Chips**: Mantém histórico automático de status e recargas com data e hora, Restrição 24h e alertas calculados de próxima recarga.
12. **SMTP Administrativo**: Administradores configuram o Google Workspace para recuperação de senha, convites e notificações do Auth; a senha fica protegida no Supabase Vault.
13. **Briefing Geral do Cliente**: Cada projeto possui um link público e exclusivo para coletar informações gerais do cliente. A trilha muda conforme o serviço contratado — Lançamento Digital, Marketing Digital ou Identidade Visual — sem se confundir com o briefing próprio de cada lançamento. O Clave preserva o conteúdo original e preenche somente campos compatíveis que ainda estejam vazios.
14. **Candidatura Pública de Experts**: A página `/candidatura` recebe potenciais parceiros em duas etapas, registra consentimento LGPD e mantém cada resposta como lead independente. Administradores avaliam a fila global, registram notas e podem criar um projeto diretamente da candidatura, preservando o vínculo de origem.
15. **Onboarding Público B16**: A página institucional `/onboarding` apresenta a metodologia PD3, o processo inicial, os materiais necessários e os acordos de colaboração. A rota não exige login, não acessa o banco, usa imagens autorais otimizadas e não permite indexação por mecanismos de busca.
16. **Cliente & Evolução por Projeto**: Cada projeto possui um perfil contratual, um cenário de entrada preservado e um cenário atual editável. O briefing público alimenta somente campos compatíveis ainda vazios no perfil e no marco zero; a equipe acompanha faturamento, audiência, operação e biografia atual sem duplicar o histórico do módulo Lançamentos.
17. **Monitoramento Administrativo**: Falhas inesperadas dos formulários públicos, anexos, candidaturas e renderização do navegador são capturadas silenciosamente com um identificador interno. Somente administradores acessam a fila global e o diagnóstico completo, registram notas e controlam os estados Novo, Em análise e Resolvido; o visitante recebe apenas uma mensagem amigável e o responsável recebe um alerta por e-mail.
18. **Banco de Histórias com Áudio**: Uma história pode ser digitada, gravada pelo microfone ou enviada como arquivo. A fala é transcrita localmente no navegador, o texto permanece editável e o áudio original é guardado em bucket privado. O Criador de Conteúdo usa somente a chave OpenAI ou Claude cadastrada no projeto ativo.
19. **Instagram Analytics por Projeto**: Cada projeto conecta uma conta profissional pela API oficial da Meta e acompanha seguidores, crescimento, alcance, visualizações, engajamento e conteúdos de destaque. Os tokens ficam no Supabase Vault e os snapshots diários constroem o histórico próprio do Clave.

---

## 💻 Como Executar Localmente

### 1. Pré-requisitos
*   Node.js v20.9 ou superior instalado.
*   Repositório clonado e dependências instaladas.

### 2. Configurando o Ambiente
Crie um arquivo chamado `.env.local` na pasta raiz e insira as chaves de acesso:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-publica
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-privada
SUPABASE_MANAGEMENT_ACCESS_TOKEN=seu-token-management-privado
# Opcional; pode ser derivado da URL do Supabase
SUPABASE_PROJECT_REF=seu-project-ref
INSTAGRAM_APP_ID=seu-app-id-da-meta
INSTAGRAM_APP_SECRET=seu-app-secret-da-meta
# Opcional; o conector possui um padrão compatível
INSTAGRAM_GRAPH_API_VERSION=v23.0
CRON_SECRET=um-segredo-longo-para-a-sincronizacao-diaria
```

`SUPABASE_SERVICE_ROLE_KEY` é usada apenas no servidor por rotas administrativas
e pelas rotas públicas controladas de formulários. Nunca use o prefixo `NEXT_PUBLIC_`, nunca disponibilize essa
variável durante o build e nunca a envie ao navegador ou ao Git.
`SUPABASE_MANAGEMENT_ACCESS_TOKEN` segue a mesma regra e é usado somente para
sincronizar o SMTP do Supabase Auth. A senha de aplicativo do Google Workspace
é cadastrada na tela administrativa e nunca deve ser colocada neste arquivo,
no Git ou no chat.

Não existe uma chave global de IA no ambiente. Um administrador cadastra a
chave OpenAI ou Claude dentro do Criador de Conteúdo de cada projeto. O backend
valida a credencial e guarda somente o segredo criptografado no Supabase Vault.

No painel da Meta, cadastre a URL de callback
`https://seu-dominio/api/instagram/callback`, o retorno de desautorização
`https://seu-dominio/api/instagram/deauthorize` e a solicitação de exclusão
`https://seu-dominio/api/instagram/data-deletion`. Use
`https://seu-dominio/privacidade` como política de privacidade e solicite acesso
avançado somente às permissões `instagram_business_basic` e
`instagram_business_manage_insights`. A rotina diária deve fazer um `POST`
para `/api/cron/instagram-sync` com o cabeçalho
`Authorization: Bearer <CRON_SECRET>`.

### 3. Executando os Comandos
```bash
# Instalar exatamente as dependências registradas no lockfile
npm ci

# Rodar em modo de desenvolvimento (localhost:3000)
npm run dev

# Executar verificação de linter e formatação
npm run lint

# Verificar os tipos sem gerar artefatos
npm run typecheck

# Verificar vulnerabilidades de produção
npm run audit:prod

# Gerar build de produção local
npm run build

# Executar a aplicação compilada em modo de produção
npm run start
```

Antes de qualquer deploy, siga a ordem de migrações e o checklist de validação
descritos em [DEPLOYMENT.md](./DEPLOYMENT.md). As migrações do Supabase não são
executadas automaticamente pelo Docker ou pelo Coolify.
