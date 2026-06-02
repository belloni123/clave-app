# Guia de Desenvolvimento -- Clave

## Comandos Úteis
*   **Ambiente de desenvolvimento**: `npm run dev`
*   **Produção Build**: `npm run build`
*   **Linter & Formatação**: `npm run lint`

## Arquitetura e Estrutura
*   **Stack**: Next.js 16 (App Router) + Tailwind CSS v4 + React Query + Zustand + Supabase (RLS).
*   **Multi-tenant (Tenant = Projeto)**: O isolamento lógico dos dados baseia-se no `project_id`. As políticas RLS do Supabase garantem que os usuários só acessem dados de projetos em que são donos ou colaboradores designados (`user_has_project_access`).
*   **Responsividade**:
    *   A barra lateral (`AppShell.tsx`) atua como um **Drawer deslizante no mobile** (< 768px) com backdrop desfocado e botão de fechar, abrindo através do ícone hambúrguer do cabeçalho. Em desktop (>= 768px), assume comportamento colapsável padrão.
    *   Os botões e badges adicionais do cabeçalho superior ocultam-se ou adaptam-se no mobile para evitar overflow horizontal.
    *   Formulários e grids utilizam layouts adaptativos (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3` e flex-wrap) adequados para viewports estreitas de 375px/390px.

## Diretrizes de Código
1.  **Tipagem Estrita**: É proibida a utilização do tipo `any`. Use tipos específicos, tipos derivados (`Partial<T>`, `Omit<T, K>`), ou `unknown` com asserções limpas (`as T` para tipos definidos) ou verificações (`err instanceof Error`).
2.  **Renders em Cascata (react-hooks/set-state-in-effect)**: Não execute atualizações de estado síncronas em efeitos. Para dependências locais complexas, utilize um timer adiado (`setTimeout(..., 0)`) ou redesenhe o fluxo de propriedades.
3.  **Entidades JSX**: Aspas e caracteres especiais no JSX devem ser devidamente escapados (ex: `&quot;` em vez de `"`, ou wrap com `{"\""}`).
4.  **Imagens**: Imagens estáticas devem usar `<Image />` do `next/image`. Para geradores de QR Code externos dinâmicos, adicione o comentário de desativação do linter: `{/* eslint-disable-next-line @next/next/no-img-element */}`.
5.  **Evitar Recursão Infinita em Políticas RLS**: Nunca cruze referências diretas de tabelas (Tabela A -> Tabela B -> Tabela A) em regras RLS, pois isso gera erros de recursão infinita (código de erro Postgres `42P17`). Utilize funções auxiliares declaradas como `SECURITY DEFINER` (que rodam como `postgres`, bypassando o RLS) para realizar consultas cruzadas sem disparar loops de regras RLS.

