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

## 4. UI Shell e Responsividade

Para atender aos padrões modernos de design e acessibilidade, a plataforma utiliza o padrão de **App Shell** responsivo:

### Comportamento Desktop (largura >= 768px):
*   A **Sidebar** lateral fica visível por padrão e pode ser colapsada para o modo compacto (apenas ícones) clicando no botão de menu ao lado do logotipo.
*   O cabeçalho superior (Topbar) exibe o título do módulo ativo, o indicador visual de Maturidade do projeto e os botões utilitários de atalho rápido.

### Comportamento Mobile (largura < 768px):
*   A **Sidebar** recolhe-se totalmente. O topo do site exibe o botão hambúrguer para abrir a navegação lateral como um **Drawer deslizante**.
*   Um backdrop translúcido com desfoque (`backdrop-blur-[2px]`) é exibido sob o Drawer e fecha o menu se o usuário clicar fora dele.
*   O Topbar oculta elementos secundários (como o Maturity Badge e botões utilitários extras) para priorizar o espaço e evitar quebras de layout.
*   As tabelas e listagens adaptam-se com barras de rolagem horizontais nativas ou transformam-se em cartões verticais flexíveis para evitar esmagamento visual em telas de 375px/390px.
