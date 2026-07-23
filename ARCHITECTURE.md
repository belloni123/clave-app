# Clave App - Arquitetura de Software

Esta documentação detalha a arquitetura técnica da plataforma **Clave**, explicando a organização de módulos, o ciclo de vida do estado global, a integração segura com Inteligência Artificial e as diretrizes de layout e responsividade.

---

## 1. Visão Geral da Arquitetura

O Clave é estruturado como uma **Single Page Application (SPA)** robusta construída sobre o framework **Next.js 16 (App Router)** e **React 19**. Ele adota uma abordagem de isolamento lógico multi-tenant por projeto e utiliza componentes reativos modulares para as diferentes áreas de controle de marketing e financeiro.

```
+-------------------------------------------------------------+
|                        Interface React                      |
+-------------------------------------------------------------+
                               |
                               v
                     +-------------------+
                     |    AppShell.tsx   |
                     +-------------------+
                               |
                               v
                    +--------------------+
                    |  ProjectSwitcher   |
                    +--------------------+
                               |
             +-----------------+-----------------+
             |                 |                 |
             v                 v                 v
     +--------------+  +--------------+  +--------------+
     |  Concepção   |  | Comunicação  |  |  Financeiro  |  ...
     +--------------+  +--------------+  +--------------+
             |                 |                 |
             +-----------------+-----------------+
                               |
                               v
                     +-------------------+
                     |   Zustand Store   |
                     +-------------------+
                               |
                               v
                     +-------------------+
                     |    React Query    |
                     +-------------------+
                               |
                               v
                     +-------------------+
                     |   Supabase RLS    |
                     +-------------------+
```

---

## 2. Gerenciamento de Estado Global (Zustand)

A plataforma utiliza o **Zustand** (`store/useAppStore.ts`) para manter o estado global da aplicação que não necessita de persistência pesada em banco de dados ou que coordena elementos de interface comuns de forma síncrona.

### Estado Armazenado:
*   **Autenticação e Perfil (`profile`)**: Dados do perfil carregados do Supabase no login (role, plano, etc).
*   **Projetos e Seleção (`projects`, `activeProjectId`)**: Lista de projetos ativos e ID do projeto selecionado como escopo atual.
*   **Nível de Maturidade (`currentLevel`)**: O nível do projeto ativo (Fundação, Estruturação, Tração, Expansão, Escala) mapeado a partir de valores do banco (`newbie`, `soft`, `hard`, `pro`, `master`).
*   **Navegação Ativa (`activeModule`, `activeTab`)**: Identificador do módulo carregado no painel central e sub-aba correspondente.
*   **Interface da Sidebar (`sidebarCollapsed`)**: Estado colapsado/expandido do menu de navegação lateral.
*   **Tema Ativo (`theme`, `toggleTheme`)**: Permite alternar entre o tema claro (`light`) e escuro/preto (`dark`). Salva a preferência do usuário no `localStorage` e aplica a classe `.dark` no elemento raiz `<html>`.
*   **Toast Global (`toast`)**: Estado para exibição de mensagens de sucesso ou erro flutuantes com auto-clear de 2.2 segundos.

---

## 3. Integração e Segurança de Inteligência Artificial

As chamadas para Inteligência Artificial utilizam a API oficial do Gemini de forma segura contra a exposição de chaves no frontend.

### Fluxo de Comunicação com a IA:
1. O frontend faz uma chamada do tipo `POST` para o endpoint interno: `/api/ai/analyze`.
2. A requisição envia no corpo os parâmetros e prompts necessários para a geração/estudo.
3. No servidor, a rota Next.js intercepta a requisição, recupera de forma segura a variável `GEMINI_API_KEY` do ambiente, e instancia o cliente do Gemini.
4. O modelo utilizado é o **`gemini-2.5-flash`** que fornece:
   - Respostas ultra rápidas (latência ideal para MVP).
   - Saídas estruturadas garantidas por **Structured Outputs** (JSON Schema).
5. Caso o servidor não possua a chave `GEMINI_API_KEY` configurada, o backend faz um fallback automático para simulações locais (mock data) de forma transparente para o usuário.

---

## 4. Sincronização de BI dos Lançamentos

O módulo de Lançamentos possui um conector server-side dedicado para trazer
dados do dashboard B16 para o Supabase sem depender de acesso direto ao banco
do BI.

### Fluxo da sincronização

1. O frontend carrega `/api/lancamentos/[launchId]/bi-sync` com a sessão atual.
2. A rota valida o usuário no Supabase, resolve o lançamento por RLS e calcula
   se o perfil pode gerenciar o projeto. O estado visual `canManage` nunca é
   tratado como autorização.
3. A URL cadastrada é validada contra o host e caminho permitidos. O destino
   consultado pelo servidor é fixo no conector B16, impedindo SSRF por uma URL
   enviada pelo navegador.
4. Cinco planilhas CSV são consultadas com timeout, sem cache e com limite de
   8 MB por resposta. O parser calcula métricas apenas para o código `0726` e
   para o período solicitado.
5. O Supabase grava a configuração em `launch_bi_integrations`, o histórico em
   `launch_bi_snapshots` e os campos compatíveis em `lancamentos_realizado`.

### Limites de confiança

O dashboard e o Worker B16 são dependências externas. Textos vindos dessas
fontes são renderizados como texto pelo React, e o backend limita tempo e
tamanho das respostas. No banco, RLS decide quem pode ler ou escrever e
constraints compostas garantem que projeto, lançamento e integração sempre
representem a mesma relação, inclusive em chamadas diretas à API do Supabase.

## 5. UI Shell e Responsividade

Para atender aos padrões modernos de design e acessibilidade, a plataforma utiliza o padrão de **App Shell** responsivo:

### Comportamento Desktop (largura >= 768px):
*   A **Sidebar** lateral fica visível por padrão e pode ser colapsada para o modo compacto (apenas ícones) clicando no botão de menu ao lado do logotipo.
*   O cabeçalho superior (Topbar) exibe o título do módulo ativo, o indicador visual de Maturidade do projeto, os botões utilitários de atalho rápido e a alternância de temas (ícone de Sol/Lua).

### Comportamento Mobile (largura < 768px):
*   A **Sidebar** recolhe-se totalmente. O topo do site exibe o botão hambúrguer para abrir a navegação lateral como um **Drawer deslizante**.
*   Um backdrop translúcido com desfoque (`backdrop-blur-[2px]`) é exibido sob o Drawer e fecha o menu se o usuário clicar fora dele.
*   O Topbar oculta elementos secundários (como o Maturity Badge e botões utilitários extras) para priorizar o espaço e evitar quebras de layout.
*   As tabelas e listagens adaptam-se com barras de rolagem horizontais nativas ou transformam-se em cartões verticais flexíveis para evitar esmagamento visual em telas de 375px/390px.

### Regra de Logotipo Dinâmico B16:
*   O sistema carrega o logotipo oficial da B16. Quando o fundo é branco (`theme === 'light'`), renderiza-se o logotipo em preto (`/logo_black.svg`). Quando o fundo é escuro/preto (`theme === 'dark'`), renderiza-se o logotipo em branco (`/logo_white.svg`).
*   Caso a barra lateral esteja colapsada, a imagem renderiza dinamicamente o ícone compacto `favicon.svg` (um quadrado amarelo com o símbolo `/` e letra `C`).
