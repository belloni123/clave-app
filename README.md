# Clave - Plataforma de Gestão Estratégica de Marketing

O **Clave** é uma plataforma robusta de gestão estratégica de marketing desenvolvida como um MVP completo em Next.js 16, estilizado com Tailwind CSS v4, gerenciado por Zustand, otimizado com React Query e integrado ao Supabase para Autenticação e Banco de Dados (PostgreSQL) com suporte a Row Level Security (RLS) para isolamento de dados.

---

## 🚀 Documentação Detalhada

Para facilitar o desenvolvimento, a manutenção e o deploy do sistema, a documentação foi modularizada em guias técnicos dedicados:

*   **[Arquitetura do Software (ARCHITECTURE.md)](./ARCHITECTURE.md)**: Explicação sobre a estrutura modular do Next.js, ciclo de vida do estado global no Zustand, fluxo e segurança das chamadas de Inteligência Artificial com Gemini e padrões de responsividade UI.
*   **[Modelo de Banco de Dados e Segurança (DATABASE.md)](./DATABASE.md)**: Dicionário de tabelas do banco de dados, mapeamento de chaves estrangeiras, triggers de inicialização de perfil e políticas RLS detalhadas com funções de desvio para evitar recursão infinita.
*   **[Manual de Implantação e Deploy (DEPLOYMENT.md)](./DEPLOYMENT.md)**: Orientações de configuração de variáveis de ambiente e deploy em nuvem através da Vercel, Docker Standalone ou VPS própria via Coolify.
*   **[Política de Segurança (SECURITY.md)](./SECURITY.md)**: Versão suportada, canal privado de reporte e regras para tratamento de segredos.

---

## 🛠️ Stack Tecnológica

A stack do projeto garante velocidade de processamento, performance de compilação e isolamento seguro de dados:

*   **Frontend**: Next.js 16 (App Router) + React 19.
*   **Estilização**: Tailwind CSS v4 (com variáveis nativas integradas via `@theme` em `globals.css`).
*   **Estado Global**: Zustand para fluxo reativo leve (sidebar, maturidade do projeto e projetos ativos).
*   **Banco de Dados & Autenticação**: Supabase (PostgreSQL) integrado ao ciclo de Next.js via Cookies (`@supabase/ssr`).
*   **Gerenciamento de Cache**: React Query para sincronização inteligente de dados e invalidação de cache.
*   **Inteligência Artificial**: API do Gemini Studio (modelo `gemini-2.5-flash` com Structured Output nativo).
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
8.  **Central de Acesso Multi-usuário**: Gerencia permissões de equipe, classificando novos acessos em badges específicas para a B16 (Equipe B16, Clientes B16 e Alunos).
9.  **Dados do BI em Lançamentos**: O lançamento CNP 2 - 2026 pode sincronizar investimento, leads, vendas, faturamento, CPL e ROAS a partir do dashboard público da B16. A escrita exige acesso de gestão e mantém histórico de snapshots por projeto.

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
GEMINI_API_KEY=sua-gemini-api-key-privada
```

O runtime da aplicação não usa `SUPABASE_SERVICE_ROLE_KEY`. Essa chave só deve
existir localmente quando um script administrativo explicitamente exigir e
nunca deve ser configurada no frontend ou commitada.

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
