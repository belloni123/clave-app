# Assistente de ajuda do Clave

Balão inferior direito “Posso te ajudar?”, presente na área autenticada com projeto
selecionado. Conversa em português leve, correto, amigável; identifica-se como IA.
Atalhos sugeridos, histórico curto, nova conversa, Escape, teclado, layout responsivo
e indicação de erro/carregamento. Texto renderizado sem HTML executável.

## Vistoria e base

21 guias revisados a partir das telas e fluxos de todos os módulos do AppShell:
Dashboard e níveis; Cliente & Evolução; Concepção; Comunicação por produto;
Lançamentos e seus seis painéis, Webnário (incluindo Script de comentários), Evento
Presencial; Banco de histórias e áudio; Financeiro e precificação de serviços;
Validação direta; Planejador/Google Agenda; Links/UTM/QR/WhatsApp; Chips; Formulários;
Instagram/Analytics/publicação condicional; Central de acesso; Equipe; Candidaturas;
Monitoramento e SMTP. Requisitos históricos complementam a leitura das telas.

Limites documentados: não prometer integração de anúncios, publicação de sites,
envio de WhatsApp, recarga real de chips, criação automática de recorrências ou
publicação social desabilitada. Briefing geral do cliente é distinto do lançamento.

`utils/help/knowledge.json` é a fonte versionada. O servidor envia a versão atual
em cada resposta e reconstrói o contexto em cada pergunta. `help:check`, obrigatório
no prebuild (inclusive Docker/Coolify), detecta alterações, adições e remoções em
components/app/utils/store/types. Atualizar guias, incrementar versão e executar
`help:review` registra as fontes conferidas. A regra também está em AGENTS.md.
O guard não interpreta semanticamente o código: exige revisão humana/assistida,
não gera explicações inventadas de novas funções.

## IA e privacidade

Reutiliza exclusivamente OpenAI/Claude e chave do projeto em Supabase Vault.
Não há chave compartilhada entre clientes nem variável pública com segredo.
Usar o chat amplia o uso pago da chave daquele projeto. Administradores configuram
em Banco de histórias. Sem chave ou com falha, apresenta guia pesquisado e aviso
explícito “sem IA”; não simula resposta gerada. Não muda configurações existentes.

O endpoint verifica getUser, projeto via RLS e permissões modulares no servidor.
Não depende das permissões enviadas pelo navegador. Contexto: nome do projeto,
módulos acessíveis e, somente ao perguntar sobre formulário, título/status do
briefing do projeto. URL pública é construída pelo servidor com token verificado,
não pelo modelo. Não consulta respostas, dados financeiros, senhas de Chips ou
contatos. A base conhece as funções, não precisa enviar o banco inteiro ao provedor.
Histórico apenas em memória do navegador, apagado ao trocar projeto/usuário ou
recarregar; últimas seis mensagens seguem ao provedor em cada pergunta. OpenAI
usa store:false; políticas de retenção do provedor continuam aplicáveis.

Nenhuma ferramenta de escrita ou SQL fica disponível à IA. Instruções de sistema
separadas do conteúdo não confiável. Apenas IDs de guias conhecidos geram atalhos;
links de formulário passam por allowlist e RLS. Limites: 2.000 caracteres por
pergunta, 24 KB por requisição, 12 perguntas/minuto, 100/dia por usuário, uma geração
simultânea por usuário. Rate limit em memória do processo Coolify: reinícios zeram
contadores; antes de múltiplas réplicas, mover para armazenamento compartilhado.
Não é um teto de cobrança. Falhas não são registradas com conteúdo ou credenciais.
