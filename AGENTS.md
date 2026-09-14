<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Regra obrigatória: ajuda do Clave

Ao adicionar, alterar ou remover uma funcionalidade, revise os guias afetados em
`utils/help/knowledge.json`, incluindo nomes exatos de telas, caminhos, limites e
permissões. Incremente `version` e execute `npm run help:review` somente depois da
revisão. Mudanças apenas técnicas também devem registrar a revisão sem impacto no
texto quando aplicável. O build executa `help:check` e bloqueia fontes não revisadas.
Não contorne a verificação nem renove o snapshot sem conferir a base. Novos módulos
precisam de guia; funções removidas não podem continuar sendo recomendadas.
O prompt é montado com a base versionada em toda pergunta: não existe prompt
externo separado para atualizar. Teste perguntas representativas e as permissões.
O assistente é somente leitura e nunca recebe senhas, chaves, PINs, respostas de
formulários ou um dump do banco. Consultas contextuais novas exigem RLS, projeto
explícito, permissão modular, campos mínimos e testes de isolamento.
