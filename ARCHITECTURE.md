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
*   **Projetos e Seleção (`projects`, `activeProjectId`)**: Lista de projetos ativos e ID do projeto selecionado como escopo atual. O ID é salvo em `localStorage` e só é restaurado se continuar presente na lista autorizada.
*   **Módulos Permitidos (`allowedModules`)**: Lista carregada de `project_users.allowed_modules`; controla menu, atalhos e retorno seguro ao Dashboard quando o acesso muda.
*   **Nível de Maturidade (`currentLevel`)**: O nível do projeto ativo (Fundação, Estruturação, Tração, Expansão, Escala) mapeado a partir de valores do banco (`newbie`, `soft`, `hard`, `pro`, `master`).
*   **Navegação Ativa (`activeModule`, `activeTab`)**: Identificador do módulo carregado no painel central e sub-aba correspondente.
*   **Interface da Sidebar (`sidebarCollapsed`)**: Estado colapsado/expandido do menu de navegação lateral.
*   **Tema Ativo (`theme`, `toggleTheme`)**: Permite alternar entre o tema claro (`light`) e escuro/preto (`dark`). Salva a preferência do usuário no `localStorage` e aplica a classe `.dark` no elemento raiz `<html>`.
*   **Toast Global (`toast`)**: Estado para exibição de mensagens de sucesso ou erro flutuantes com auto-clear de 2.2 segundos.

---

## 3. Autorização Por Projeto e Módulo

O acesso possui duas camadas complementares:

1. `project_users` define vínculo, nível (`viewer`, `editor`, `admin`) e
   `allowed_modules`.
2. Políticas RLS restritivas usam
   `user_has_project_module_access(project_id, module, auth.uid())` para
   proteger os dados mesmo quando a API do Supabase é chamada fora da
   interface.

Donos de projeto, administradores do sistema, administradores da agência e
administradores do projeto têm acesso administrativo. Mudanças de nível,
revogação e módulos são registradas em `project_access_audit`.

O cadastro em `Central de acesso > Usuários e módulos` é uma operação única.
A rota autenticada `POST /api/project-users/invite` valida se o operador pode
administrar o projeto e, somente no servidor, usa a chave administrativa do
Supabase para localizar ou criar a conta. Em seguida sincroniza `profiles` e
faz `upsert` do vínculo em `project_users`. Para uma conta nova, a senha
temporária informada pelo administrador (ou uma senha forte gerada no servidor)
é aplicada no Auth com o e-mail já confirmado, e o convite personalizado, com
o mesmo padrão visual do e-mail de recuperação, é enviado pelo SMTP configurado.
O botão abre somente `/login`: o usuário entra com a senha temporária e o perfil
com `must_change_password = true` direciona a primeira sessão para
`/definir-senha?obrigatoria=1`. A senha temporária nunca é salva em tabela
pública, metadata ou log. Ela é devolvida uma única vez ao administrador
autorizado para permitir copiar o convite e enviá-lo por WhatsApp.
Se a conta ainda estiver pendente, sem e-mail confirmado e sem qualquer login,
um novo convite conclui o cadastro: reaplica a senha temporária informada (ou
gera outra), confirma o e-mail, mantém a troca obrigatória e reenvia as
credenciais. Uma conta sem qualquer vínculo ativo também recebe novas
credenciais ao ser readicionada. Quando a conta já possui outro acesso ativo,
a concessão preserva a senha atual e envia somente o link de login. Para
gerenciar uma conta ativa, o administrador usa a
ação explícita de chave. Nela pode definir uma nova senha temporária, escolher
se deseja enviá-la por e-mail e reenviar apenas o link simples de login sem
alterar a senha. Toda senha alterada por um administrador marca a troca como
obrigatória no próximo acesso. A revogação mantém o vínculo e a auditoria no
banco, mas remove a pessoa da lista ativa; uma nova concessão é feita por
`Adicionar usuário`, que reativa o mesmo vínculo por `upsert`.
Os links de e-mail usam `APP_URL` quando configurada. Em produção, o domínio
canônico `https://clave.agenciab16.com.br` é o fallback, impedindo que o
endereço interno `0.0.0.0:3000` seja exposto ao usuário.
Ao concluir a troca, `POST /api/auth/complete-password-change` atualiza a senha
pela própria sessão autenticada e usa `service_role` somente para limpar o
marcador no perfil. O cliente não tem permissão de coluna para limpar esse
marcador diretamente. A troca obrigatória mantém a sessão e abre o dashboard
autorizado; a recuperação de senha encerra a sessão temporária do Supabase e
retorna ao login para a entrada com a nova senha.

O link de recuperação aponta para `/auth/confirm`, confirma o `TokenHash` no
servidor e abre `/definir-senha?recuperacao=1`. Enquanto um template antigo do
Supabase ainda estiver em cache, o `redirectTo` usa `/auth/callback` e preserva
o mesmo destino. Nenhum desses fluxos cria projetos automaticamente: sem um
vínculo ativo, a conta permanece sem projeto até um administrador concedê-lo.

## 3.1 SMTP Global E Supabase Auth

`AdminSmtpModule` é uma configuração global fora do escopo de projetos. O menu
é liberado somente para administradores, e a rota `/api/admin/smtp` repete a
validação no servidor. A edição exige a allowlist dos e-mails autorizados,
portanto esconder o menu não é o controle de segurança.

O fluxo de salvar é:

1. A sessão é validada com Supabase Auth e o papel é consultado no backend.
2. A senha de aplicativo do Google Workspace é armazenada no Supabase Vault;
   a tabela pública guarda apenas a referência e os metadados.
3. O servidor chama `PATCH /v1/projects/{project_ref}/config/auth` da
   Supabase Management API usando `SUPABASE_MANAGEMENT_ACCESS_TOKEN` somente
   no runtime.
4. O Supabase Auth passa a usar esse SMTP para recuperação de senha, convites,
   OTP/magic links e futuras notificações de Auth.
5. O teste abre uma conexão SMTP com timeout, envia uma mensagem ao
   administrador que executou a ação e registra somente dados não sensíveis.

Nenhum token, senha ou segredo é enviado ao navegador, incluído no bundle,
registrado na auditoria ou versionado no Git.

## 3.2 Briefing Geral Do Cliente Por Projeto

Cada projeto recebe automaticamente um `project_forms` do tipo
`client_briefing`, com UUID público próprio. Este formulário reúne informações
gerais do cliente e do serviço contratado. Ele não pertence a um lançamento e
não lê nem altera a tabela `briefings`; cada lançamento mantém seu próprio
briefing. A URL pública não usa a sessão do cliente e não acessa o Supabase
diretamente: as rotas
`/api/public/forms/[token]` validam o formulário e operam com `service_role`
somente depois dessa validação.

Ao salvar pela primeira vez, o servidor gera 32 bytes aleatórios para o token
de retomada. Apenas o SHA-256 fica em `project_form_submissions`; o valor
original aparece na URL entregue ao cliente. Assim, conhecer o link geral do
formulário não permite ler ou alterar respostas de outra pessoa. As tabelas não
possuem grants para `anon`, e a resposta pública nunca devolve anotações,
resumo, campos espelhados ou caminhos privados de anexos.

O briefing possui três trilhas condicionais: Lançamento Digital, Marketing
Digital e Identidade Visual. Rascunhos são salvos automaticamente. O status
`waiting` reabre a mesma resposta para complemento; os demais estados encerram
a edição pública. Referências visuais aceitam somente JPG, PNG e WebP, até 8 MB
e cinco arquivos por resposta, em bucket privado.

Antes das trilhas condicionais, o formulário coleta o perfil cadastral e o
cenário de entrada do cliente. No envio, esses campos também passam pelo
espelhamento conservador para `project_client_profiles`: somente chaves vazias
de `contract_profile` e `baseline_snapshot` são preenchidas. O
`current_snapshot` nunca é copiado do formulário público e permanece sob
controle da equipe.

No envio, `syncBriefingToProject` mantém a resposta integral e executa um
espelhamento conservador: identifica campos existentes por chave estável,
preenche apenas os vazios e registra separadamente o que foi preenchido ou
preservado. Nunca sobrescreve conteúdo já revisado pela equipe. O painel interno
oferece busca, status, notas, resumo determinístico, exportação e impressão/PDF.
O módulo segue `project_users.allowed_modules` com a chave `formularios` e exige
nível de gestão do projeto, evitando que perfis somente leitores consultem
respostas ou anotações internas.

No fluxo de Lançamento, nome do produto, diferencial, transformação, promessa,
público, benefícios e razão de escolha alimentam o produto correspondente em
Comunicação (Mecanismo Único, Resultado-Alvo, Promessa principal, Para Quem É,
Benefício Estendido e Ponto de Indiferença). Marketing e Identidade Visual
preenchem apenas os campos com equivalência direta. Os dados comuns também são
guardados em `text_fields` com prefixo `client_briefing_` para uso futuro, sem
alterar o nome cadastrado do projeto.

## 3.3 Cliente E Evolução Por Projeto

`ClienteModule` usa uma única linha de `project_client_profiles` por projeto e
apresenta três visões do mesmo cliente:

1. `contract_profile`: nome, e-mail, telefone, CNPJ e razão social.
2. `baseline_snapshot`: marco de entrada preservado por convenção, com negócio,
   resultados, audiência e estrutura operacional anterior à B16.
3. `current_snapshot`: retrato editável, com os mesmos indicadores, biografia e
   comparação direta com o marco de entrada.

O módulo não cria ou altera lançamentos. A quantidade informada nos cenários é
somente um indicador agregado; datas, etapas, verba e resultados por lançamento
continuam pertencendo ao módulo Lançamentos. Essa separação também permite
acompanhar clientes recorrentes que não trabalham com lançamentos.

A navegação e a RLS usam a chave `cliente`. Administradores podem concedê-la
por projeto na Central de acesso. A tabela aceita leitura e escrita somente de
usuários autenticados com acesso ao módulo no mesmo projeto; toda escrita feita
pela interface registra `updated_by`.

## 3.4 Candidatura Pública De Experts

`/candidatura` é um fluxo comercial global da Agência B16 e não pertence a um
projeto. Cada envio cria uma linha própria em `expert_applications`, identificada
pelos dados de contato do lead. A página não acessa o Supabase diretamente: o
`POST /api/public/expert-applications` valida novamente todos os campos no
servidor e grava a resposta com `service_role` somente após passar pelo limite
de tentativas, campo-armadilha, tempo mínimo de preenchimento e idempotência.

Administradores veem a fila no módulo global `Candidaturas`. A interface permite
classificar, anotar e consultar a resposta integral. A função transacional
`convert_expert_application_to_project` bloqueia a candidatura, cria o projeto
e grava `converted_project_id`, `converted_by` e `converted_at` na mesma
operação. Chamadas repetidas devolvem o projeto já vinculado, evitando projetos
duplicados. O briefing geral do novo cliente é criado pelo trigger normal de
projetos; briefings de lançamentos continuam independentes.

## 3.5 Onboarding Público B16

`/onboarding` é uma página institucional pós-contrato, igual para todos os
clientes e acessível sem sessão. A rota usa metadata própria com
`noindex, nofollow`, não cria API, não consulta o Supabase e não recebe dados do
visitante. Dessa forma, sua publicação não altera o isolamento dos projetos nem
o fluxo autenticado do Clave.

O conteúdo visual fica em `components/public/OnboardingPage.tsx`. A abertura usa
uma imagem prioritária e em tela cheia; a imagem de Metodologia PD3 é carregada
de forma tardia pelo `next/image`. Ambas estão em WebP dentro de
`public/images`, com dimensões responsivas informadas ao navegador. As entradas
progressivas usam `IntersectionObserver`, mantêm o espaço estável e são
desativadas quando o dispositivo informa `prefers-reduced-motion`.

As seções usam HTML semântico, títulos encadeados e ícones decorativos ocultos
da árvore de acessibilidade. O único controle de navegação é um link interno com
foco visível. Não há estado compartilhado com o painel autenticado.

## 3.6 Monitoramento Administrativo De Erros

Erros inesperados nas rotas públicas de briefing, anexos e candidatura são
registrados por `recordAppError` em `app_error_events`. O mesmo fluxo gera um
código interno `CLV-XXXXXXXXXXXX`, disponível somente no painel administrativo
e no log do servidor. O visitante recebe apenas uma mensagem amigável. Respostas de validação esperadas, como campo
obrigatório ou limite de tentativas, não entram na fila de falhas.

Falhas de rede e renderização que acontecem somente no navegador usam
`POST /api/public/error-events`. O endpoint limita corpo e frequência por HMAC
da origem, resolve formulário e rascunho no servidor e nunca persiste tokens,
respostas completas, senhas, URLs com query string ou conteúdo de anexos. O
registrador também remove padrões de credenciais antes da escrita.

O módulo global `Monitoramento` consulta diretamente a tabela sob RLS, com
leitura e atualização restritas a perfis administrativos ativos. A interface
permite buscar pelo código, projeto ou lead, filtrar período/origem/status,
consultar stack trace sanitizada, registrar notas e mover a ocorrência entre Novo, Em análise e Resolvido. A
ocultação do menu é apenas conveniência; a autorização real permanece no banco.

Depois que uma ocorrência é persistida, o backend reutiliza o SMTP protegido
no Vault para enviar um alerta operacional. A entrega de e-mail é isolada do
registro: falhas do SMTP são registradas no console e não geram recursão nem
apagam a ocorrência original.

## 4. Comunicação Por Produto/Curso

`communication_products` é o primeiro nível do módulo Comunicação. Depois da
seleção, todas as abas usam `communication_product_fields`, com chave única por
produto. A migração cria `Produto principal` e copia os campos antigos de
`text_fields`, sem apagar a origem.

### 4.1 Padronização de fontes e créditos

Os conceitos exibidos pela interface usam `components/SourceCredit.tsx` para
mostrar a classificação e a origem por meio de um popover acessível:

* `[S]`: fonte clássica rastreável, com autor, obra e ano;
* `[C]`: convenção de mercado, sem um único autor;
* `[P]`: definição ainda pendente de validação humana;
* `[O]`: organização própria do Clave.

O catálogo de créditos fica em `utils/source-credits.ts`. A estrutura VSL é
analisada em 12 blocos operacionais, com os cinco passos centrais de Jon Benson
preservados dentro da sequência. O rótulo `CPL` é sempre contextualizado:
`CPL — Conteúdo de Pré-Lançamento` em Lançamentos e `CPL — Custo por Lead` em
Provisão/Financeiro. A sigla `MMQ` permanece marcada como `[P]` até que sua
expansão seja definida pelo negócio.

## 5. Histórico Operacional Dos Chips

`chips` guarda o estado atual e as datas calculadas. `chip_events` é o log
imutável de eventos automáticos e anotações manuais. Triggers registram o
cadastro, toda transição de status e recargas; a entrada em `Restrição 24h`
também agenda `restricao_24h_ate`.

## 6. Integração e Segurança de Inteligência Artificial

O Criador de Conteúdo é multi-tenant também no consumo de IA. Cada projeto
escolhe OpenAI ou Claude e usa a própria credencial; não existe chave global
nem fallback simulado.

### Fluxo de geração de conteúdo

1. A interface envia `projectId`, a tarefa e somente os campos necessários para
   `/api/ai/analyze`, com limite de corpo.
2. A rota autentica a sessão e confirma acesso ao módulo `historias` no projeto.
3. O backend lê em `project_ai_settings` qual provedor está ativo e recupera a
   credencial correspondente do Supabase Vault com `service_role`.
4. A solicitação é enviada à API oficial da OpenAI ou Anthropic. A chave nunca
   aparece em HTML, JavaScript, resposta JSON, log ou variável `NEXT_PUBLIC_*`.
5. A análise individual valida a estrutura JSON recebida antes de persistir.
   Falhas de autenticação, limite e saldo são convertidas em mensagens seguras.

Somente administradores do projeto podem cadastrar, substituir, selecionar ou
remover uma chave. As funções que alteram o Vault e os metadados executam em
uma única transação e têm `EXECUTE` revogado para `anon` e `authenticated`.

### Fluxo de áudio e transcrição

O cadastro de história aceita texto, gravação pelo `MediaRecorder` ou arquivo
de até 25 MB. O navegador decodifica o áudio para mono/16 kHz e executa Whisper
em um Web Worker com Transformers.js. O modelo é baixado e armazenado no cache
do navegador no primeiro uso. A transcrição não chama OpenAI, Claude ou uma API
do Clave e, portanto, não consome créditos dos provedores.

Depois da revisão do texto, o áudio original é enviado ao bucket privado
`story-audio`. A RLS exige acesso ao módulo `historias` do mesmo projeto e URLs
de reprodução são temporárias e assinadas.

---

## 7. Sincronização de BI dos Lançamentos

O módulo de Lançamentos possui um conector server-side dedicado para trazer
dados do dashboard B16 para o Supabase sem depender de acesso direto ao banco
do BI.

### Fluxo da sincronização

1. O frontend carrega `/api/lancamentos/[launchId]/bi-sync` com a sessão atual
   e o identificador do projeto ativo. Uma seleção só é válida quando pertence
   ao projeto exibido na navegação.
2. A rota valida o usuário no Supabase, resolve o lançamento por RLS, confirma
   que ele pertence ao projeto ativo e calcula
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

Uma integração pertence a um único lançamento. Lançamentos sem integração não
recebem URL nem snapshot de outro lançamento como valor padrão.

## 8. UI Shell e Responsividade

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

## 9. Publicação Meta dentro do Instagram

O `InstagramModule` continua iniciando no Analytics. Uma navegação interna por
query string abre compositor, lista/calendário e detalhes sem criar item lateral.
O servidor só expõe a entrada quando a flag está habilitada e `canManage` é
verdadeiro; cada rota de escrita repete a autorização do projeto.

`instagram_connections` continua sendo a fonte da credencial Meta no Vault.
`social_connections` referencia essa conexão, `social_accounts` representa a
conta profissional e as Páginas, e adapters em `utils/social/providers` isolam
as chamadas oficiais. O post comum possui destinos independentes. Um worker
reivindica itens vencidos com lease e `FOR UPDATE SKIP LOCKED`, grava checkpoints
antes de chamadas ambíguas e nunca repete automaticamente um estado `unknown`.

O upload é direto para o bucket privado `social-publishing`. O servidor valida
o objeto armazenado, inspeciona imagens com Sharp e vídeos por streaming com
`ffprobe`; URLs para a Meta são assinadas apenas no momento da execução.
