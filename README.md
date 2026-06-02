# Documentação do Projeto Clave

O **Clave** é uma plataforma de gestão estratégica de marketing desenvolvida como um MVP em Next.js 16, estilizado com Tailwind CSS v4, gerenciado por Zustand, otimizado com React Query e integrado ao Supabase para Autenticação e Banco de Dados (PostgreSQL) com suporte a Row Level Security (RLS) para isolamento multi-tenant.

---

## 1. Arquitetura Tecnológica

A stack do projeto foi selecionada para garantir velocidade de carregamento, facilidade de deploy e segurança no isolamento dos dados dos clientes:

*   **Frontend**: Next.js 16 (App Router) + React 19.
*   **Estilização**: Tailwind CSS v4 (utilizando variáveis CSS declaradas nativamente no tema `@theme` em `app/globals.css`).
*   **Estado Global**: Zustand para manipulação leve e reativa do estado da barra lateral, nível de maturidade do usuário e projetos ativos.
*   **Banco de Dados & Autenticação**: Supabase (PostgreSQL) integrado ao ciclo de vida do Next.js via Cookies (`@supabase/ssr`).
*   **Gerenciamento de Cache**: React Query para sincronização offline, paginação e invalidação de cache inteligente de dados.
*   **Hospedagem & Deploy**:
    *   **Atual**: Deploy Serverless otimizado na **Vercel** conectado ao repositório GitHub.
    *   **Futura**: Containerização Docker em modo Standalone pronta para deploy via **Coolify** (VPS Hostinger).

---

## 2. Isolamento de Dados Multi-Tenant (Segurança RLS)

Como a plataforma é voltada para agências, colaboradores e múltiplos clientes, a segurança é baseada na arquitetura **Row Level Security (RLS)** nativa do PostgreSQL no Supabase.

> [!NOTE]
> **Conceito de Tenant:** No contexto do Clave, o termo **"Tenant"** (inquilino/empresa isolada) equivale diretamente a um **"Projeto"**. Cada projeto criado atua como uma organização independente e isolada.

### Como funciona o isolamento:
1.  **Profiles (Perfis)**: Cada usuário possui um perfil associado a uma role (`admin`, `client`, `colab`, `student`).
2.  **Projects (Projetos / Tenants)**: O projeto é o limite lógico do tenant. Toda a informação de copy, finanças, anúncios e histórias pertence a um `project_id`.
3.  **Acesso Restrito**: Um usuário só pode visualizar ou alterar registros de um projeto se ele for:
    *   O **dono** que criou o projeto.
    *   Um **colaborador explicitamente associado** ao projeto na tabela `colab_assignments`.
    *   Um **administrador** global do sistema (`admin`).

Essa regra é aplicada no banco de dados pela função de segurança SQL:
```sql
create or replace function public.user_has_project_access(proj_id uuid, usr_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.projects 
    where id = proj_id and user_id = usr_id
  ) or exists (
    select 1 from public.colab_assignments 
    where project_id = proj_id and colab_id = usr_id
  ) or exists (
    select 1 from public.profiles 
    where id = usr_id and role = 'admin'
  );
end;
$$ language plpgsql security definer;
```
Cada tabela de conteúdo (anúncios, financeiro, matriz, histórias) possui uma política RLS que bloqueia requisições que não passem nessa validação:
```sql
create policy "Acesso ao projeto para anúncios"
  on public.ads for all
  using (public.user_has_project_access(project_id, auth.uid()));
```

### Criação de Perfis & Políticas RLS da Tabela Profiles:

*   **Trigger do Banco de Dados (`on_auth_user_created`)**: Para evitar falhas de criação silenciosas, quando um novo usuário se cadastra em `auth.users` do Supabase, o trigger automático `on_auth_user_created` executa a função `public.handle_new_user()` com privilégios elevados (`security definer`) para inserir a linha correspondente na tabela `public.profiles` (com role `'client'`, plano `'free'` e limite de 2 projetos).
*   **Políticas RLS em `public.profiles`**:
    *   `SELECT`: Usuários podem visualizar o próprio perfil (`auth.uid() = id`) e administradores podem ler todos.
    *   `UPDATE`: Usuários podem atualizar seus próprios perfis.
    *   `INSERT`: Usuários autenticados podem criar seu próprio perfil (`auth.uid() = id`), servindo de fallback resiliente para o frontend.
    *   `DELETE`: Apenas administradores do sistema possuem permissão para excluir contas de usuários.

---

## 3. Fluxo de Ativação e Códigos (`CLAVE-XXXX-XXXX`)

O **Código de Ativação** é uma estratégia de controle de entrada na plataforma. Ele impede que qualquer pessoa acesse a página de cadastro e crie uma conta livremente, garantindo que o sistema seja restrito a convidados (como alunos da mentoria ou clientes da agência).

### Como funciona no MVP:
*   Para criar uma conta, o usuário acessa `/login` > **Ativar minha conta**.
*   Ele precisa preencher o e-mail, criar uma senha e fornecer um código que inicia com **`CLAVE-`** (por exemplo: `CLAVE-1234-5678`).
*   No frontend, o sistema valida a máscara do código (`CLAVE-XXXX-XXXX`) para permitir a submissão.

### Implementação Recomendada para Escala (Produção):
Para transformar isso em um sistema dinâmico e seguro à prova de fraudes:
1.  **Tabela de Convites**: Cria-se uma tabela no banco de dados chamada `activation_codes`:
    ```sql
    create table public.activation_codes (
      code text primary key,
      email text, -- opcional, para amarrar o código a um e-mail específico
      used_by uuid references auth.users(id),
      created_at timestamp with time zone default now()
    );
    ```
2.  **Verificação no Banco**: Durante o cadastro do usuário (no Next.js ou via Database Trigger no Supabase), o sistema verifica se o código enviado está na tabela `activation_codes` e se ainda não foi utilizado.
3.  **Geração**: O administrador gera novos códigos pelo painel e os envia por WhatsApp ou e-mail automatizado para os novos clientes.

---

## 4. Integração com Inteligência Artificial

A plataforma utiliza a API do Gemini de forma segura contra vazamento de credenciais no frontend, encapsulando as requisições em um **Route Handler** do Next.js:

*   **Endpoint**: `/api/ai/analyze`
*   **Modelo Utilizado**: `gemini-2.5-flash`
    *   **Por que o 2.5-flash?** É o modelo com o melhor custo-benefício da atualidade, oferecendo latência extremamente baixa, excelente raciocínio de copy e suporte nativo a **Structured Outputs** (respostas garantidas em JSON Schema estruturado, sem alucinações de formatação).
*   **Segurança**: A chave `GEMINI_API_KEY` fica armazenada exclusivamente no servidor (Vercel/Coolify envs), nunca sendo exposta ao navegador do usuário. Se a chave não for fornecida, o sistema faz o fallback automático e transparente para regras mockadas locais.

---

## 5. Estrutura de Diretórios do Projeto

*   `app/`: Roteamento e páginas da aplicação Next.js (App Router).
    *   `api/ai/analyze/route.ts`: Rota proxy para chamadas à API do Gemini.
    *   `auth/callback/`: Endpoint de callback para autenticação do Supabase.
    *   `login/`: Tela de Login, Recuperação e Ativação de contas.
    *   `globals.css`: Variáveis CSS e temas globais do Tailwind v4.
*   `components/`: Componentes reusáveis da UI.
    *   `modules/`: Painéis e abas da aplicação (Dashboard, Concepção, Comunicação, Lançamentos, Validação, Histórias, Financeiro, Planejador, etc).
        *   `UrlBuilderModule.tsx`: Central de Links & QR Code (UTMs, WhatsApp e QR Code).
        *   `AcessoModule.tsx`: Central de Acesso de equipe, agência e mentorias.
    *   `AppShell.tsx`: Barra de navegação lateral com indicador de foco e cabeçalho global. Totalmente responsivo (comporta-se como drawer/backdrop em mobile e barra colapsável em desktop).
    *   `ProjectSwitcher.tsx`: Dropdown reativo de mudança de projetos isolados.
*   `store/`: Estado global do Zustand ([useAppStore.ts](file:///Users/felipebelloni/Desktop/orkestria/clave-app/store/useAppStore.ts)).
*   `supabase/`: Estrutura do banco de dados e migrações de RLS.
    *   `migrations/20260601000000_team_members.sql`: Script de criação da tabela de equipe para a Central de Acesso.
*   `utils/`: Utilitários e clientes SSR do Supabase.
*   `Dockerfile` & `next.config.ts`: Configurações de containerização prontas para o Coolify/VPS.

---

## 6. Ferramentas Integradas (Links & QR Code)

A aba **Links & QR Code** centraliza as ações de tráfego e captação do usuário em um hub leve, unificado e puramente client-side:

1.  **UTM Builder**: Mantém o rastreamento profissional por tags de marketing. O histórico dos últimos 8 links gerados é persistido na tabela `text_fields` associado ao `project_id` selecionado para fins de consistência entre logins.
2.  **WhatsApp Link Generator**: Converte telefone (DDI + DDD) e mensagem padrão em links no formato `wa.me` de forma segura.
3.  **QR Code Integrado (API do goqr.me)**:
    *   **Funcionamento**: Renderização de imagem em tempo real no frontend apontando para `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=[LINK]`.
    *   **Download de Alta Resolução**: Clicando em "Baixar QR Code", a aplicação faz uma chamada em background para a API de 600x600 pixels, converte o resultado em Blob e força o download nativo do arquivo `.png` no navegador sem necessidade de bibliotecas locais adicionais.
    *   **UX Unificada**: A geração de QR Code pode ser disparada diretamente dos resultados de links gerados em WhatsApp e UTMs com um clique.

---

## 7. Sistema de Feedback Visual (Toast Global)

Para evitar comportamentos silenciosos (como falhas de login por senha incorreta ou convites inválidos sem aviso na tela):

*   **Renderização Global**: O componente `Toast` foi integrado no layout raiz (`app/layout.tsx`). Com isso, qualquer página ou componente do sistema consegue emitir alertas visuais instantâneos.
*   **Zustand Store**: Disparado através do hook global `useAppStore()`, chamando `showToast('Mensagem de erro ou sucesso', 'err' | 'info')`.
*   **Fechamento Automático**: Os avisos desaparecem automaticamente após 2.2 segundos para não sobrecarregar a interface do usuário, mas também contam com fechamento manual ao clicar sobre o aviso.

---

## 8. Responsividade e Estabilização Técnica

A plataforma passou por uma auditoria completa de código e visual para garantir 100% de estabilidade:

*   **Linter ESLint & Build**: Zerados todos os erros e warnings do compilador. Não existem mais tipos `any` genéricos, aspas não escapadas ou variáveis não utilizadas em todo o codebase.
*   **Performance (Hooks)**: Corrigido o erro de renderizações em cascata e timers infinitos nos efeitos (`useEffect`) dos módulos de Lançamentos e Comunicação, adiando a atualização do estado local para a próxima micro-macro tarefa via timers devidamente limpos ao desmontar.
*   **Adaptações Visuais Mobile**:
    *   **Sidebar Drawer**: Em resoluções móveis (como 375px/390px), a barra lateral se esconde automaticamente e se transforma em um drawer deslizante que pode ser aberto pelo botão hambúrguer no cabeçalho e fechado ao clicar no backdrop escuro desfocado ou no botão "X".
    *   **Responsividade em Listagens**: A listagem de clientes na Central de Acesso (`AcessoModule.tsx`) foi refatorada de layouts flex lineares espremidos para estruturas flex-wrap adaptativas que garantem que botões e textos não sofram quebras horizontais no mobile.
    *   **Topo de Página Mobile**: O cabeçalho foi simplificado em telas pequenas (escondendo botões utilitários redundantes e o Maturity Badge) mantendo o foco do espaço de tela apenas no conteúdo ativo.
