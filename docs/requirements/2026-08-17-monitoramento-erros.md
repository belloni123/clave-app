# Monitoramento Administrativo De Erros

Data: 17/08/2026

## Objetivo

Permitir que a equipe administrativa identifique falhas do Clave sem depender
de reproduzir manualmente o problema relatado por um lead ou cliente.

## Acesso

* O módulo é global e aparece em `Administração > Monitoramento`.
* Somente perfis ativos com `role = admin` ou `agency_role = admin` podem ler ou tratar ocorrências.
* Na implantação inicial, Felipe e Francisco são os dois administradores ativos; a regra acompanha o papel cadastrado e não depende de e-mails codificados na aplicação.
* Funcionários, clientes, alunos e membros com administração apenas de um projeto não possuem acesso.

## Eventos Cobertos

* Carregamento, salvamento e envio do briefing público.
* Espelhamento do briefing recebido para os campos internos do projeto.
* Upload e remoção de referências visuais do briefing.
* Envio da candidatura pública de experts.
* Falhas de rede e renderização percebidas somente pelo navegador.

Erros de validação esperados, como campo obrigatório, arquivo inválido ou
limite de tentativas, continuam sendo explicados ao visitante e não poluem a
fila operacional.

## Experiência De Suporte

* Cada falha recebe internamente um código no formato `CLV-XXXXXXXXXXXX`.
* O código, a mensagem técnica e a stack trace aparecem somente para administradores; o visitante recebe apenas uma mensagem amigável.
* A central oferece busca por código, lead, projeto e mensagem.
* Há filtros de período, origem e status, além dos estados Novo, Em análise e Resolvido.
* O detalhe mostra contexto, mensagem técnica sanitizada e anotações administrativas.

## Privacidade E Segurança

O monitoramento não guarda senhas, tokens, autorização, links de retomada,
query strings, respostas completas, imagens ou corpos brutos de requisição.
Somente identificadores opcionais, e-mail conhecido, caminho da página,
operação, navegador, HTTP e metadados explicitamente permitidos são salvos.

O endpoint de erros do navegador possui limite de tamanho e contador horário
por HMAC da origem. A tabela não aceita leitura ou escrita anônima e a interface
não é considerada uma barreira de autorização: RLS e grants por coluna aplicam
a restrição no Supabase.

## Critérios De Aceite

1. Uma falha inesperada em formulário público cria silenciosamente uma ocorrência com código interno.
2. O código permite localizar a ocorrência na busca administrativa sem ser exposto ao visitante.
3. Felipe e Francisco conseguem abrir e tratar a fila com seus papéis atuais.
4. Uma conta não administrativa não vê o módulo nem consegue ler a tabela.
5. Resolver uma ocorrência registra administrador e horário.
6. O payload armazenado não contém respostas completas nem segredos.
7. Logs do Coolify continuam recebendo o mesmo código como contingência.
