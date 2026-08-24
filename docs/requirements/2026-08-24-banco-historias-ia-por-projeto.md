# Banco de Histórias, Áudio e IA por Projeto

## Objetivo

Permitir que a equipe cadastre histórias por texto ou voz sem consumir créditos
de IA na transcrição, mantendo o Criador de Conteúdo como o único recurso que
usa uma API paga. Cada projeto deve consumir sua própria conta OpenAI ou Claude.

## Cadastro de história

O formulário oferece três modos mutuamente exclusivos:

1. **Texto**: digitação direta da história.
2. **Gravar áudio**: captura pelo microfone do navegador.
3. **Enviar áudio**: seleção de MP3, M4A, WAV, OGG ou WEBM de até 25 MB.

Nos modos de áudio, o navegador converte o arquivo para mono/16 kHz e executa o
modelo Whisper localmente em um Web Worker. O texto resultante é editável e
precisa ser revisado antes de salvar. O primeiro uso pode demorar mais porque o
modelo é baixado e colocado no cache do navegador.

A transcrição não chama OpenAI, Claude ou um endpoint de transcrição do Clave.
Somente ao salvar a história o áudio original é enviado ao bucket privado
`story-audio`, junto com os metadados do arquivo e a data de transcrição.

## Criador de Conteúdo com IA

* Não há provedor nem chave global no Coolify.
* Cada projeto pode cadastrar uma chave OpenAI, Claude ou ambas.
* Somente administradores do projeto podem alterar as chaves e selecionar o
  provedor ativo.
* Usuários com acesso ao módulo `historias` podem gerar conteúdo usando o
  provedor escolhido para aquele projeto.
* A chave é validada com o provedor antes de ser gravada.
* O segredo fica no Supabase Vault; o frontend recebe somente o status e os
  quatro caracteres finais.
* As análises e os roteiros usam o texto das histórias do projeto ativo e têm
  limites de tamanho no cliente e no servidor.

## Segurança e isolamento

* `project_ai_settings` não concede acesso a `anon` ou `authenticated`.
* Operações do Vault são server-only e atômicas com os metadados do projeto.
* Toda rota de IA valida sessão, projeto e acesso ao módulo `historias`.
* O bucket de áudio é privado, usa URLs assinadas e aplica RLS pelo projeto.
* Nenhuma credencial é retornada, registrada em logs ou exposta como variável
  pública.

## Critérios de aceite

* Uma história digitada continua podendo ser criada sem áudio.
* Uma gravação e um arquivo enviado geram transcrição local editável.
* A história salva reproduz o áudio somente para usuários autorizados.
* Um projeto sem chave recebe orientação para configurar seu provedor.
* A chave de um projeto nunca é usada por outro projeto.
* OpenAI/Claude só são chamados ao analisar uma história ou estruturar conteúdo.
* TypeScript, ESLint, auditoria de dependências de produção e build passam antes
  do deploy.
