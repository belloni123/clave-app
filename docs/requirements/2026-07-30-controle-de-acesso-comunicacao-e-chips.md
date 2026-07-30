# Requisitos - Controle de acesso, Comunicação e Chips

Data de consolidação: 30/07/2026.

Este documento registra as solicitações recebidas por texto, cinco áudios e o
documento `QFD Ladeira para Clave - Nomenclatura Tradicional.docx`. As
transcrições abaixo foram revisadas apenas para pontuação e legibilidade, sem
alterar o sentido das falas.

## Transcrições

### `clave01.ogg`

A primeira atualização é a opção de liberar módulos para funcionários e
clientes. Quando subir um novo usuário, há nome e e-mail, dentro do projeto.
Seria interessante o administrador geral poder dizer a quais projetos essa
pessoa pode ter acesso. Um colaborador da B16 pode ter vários projetos; o
cliente normalmente terá só o projeto dele. Também precisa selecionar quais
módulos serão liberados. Por exemplo: a Marcela, da Mundial Cromo, precisa ter
acesso ao projeto Mundial Cromo e somente ao Controle de Chips.

### `clave 02.ogg`

A segunda opção é que, quando eu atualizo a página, mesmo estando dentro do
projeto da Mundial Cromo, o sistema redireciona para o projeto da Audias. Isso
acontece em qualquer projeto: Casa Rê, Francisco Eugênio e outros. Precisava
corrigir isso para continuar no projeto que estava aberto.

### `clave03.ogg`

Em Comunicação, a hierarquia não está sendo respeitada. Ao clicar em
Comunicação, abre Identidades e, dentro dela, Comunicador, com método e QFD. Os
novos nomes são Mecanismo Único, Resultado-Alvo e Benefício Estendido.

Tudo que está em Comunicação precisa ficar dentro de um produto. A primeira
tela de Comunicação deveria ser Produto. Por exemplo, no projeto Maestro existe
o produto Escola do Ouvido, e cada produto tem seu QFD e sua comunicação
próprios. As demais abas só devem ser abertas depois que um produto for criado
ou selecionado. Deve existir um botão para criar produto e, dentro dele, ficar
toda a configuração de Comunicação.

### `clave 04.ogg`

Adicionar um status chamado Restrição 24h. Quando esse status for aplicado, o
sistema deve registrar que o chip ficou restrito por 24 horas e que, no dia
seguinte, é preciso verificar se foi liberado.

Quando o status voltar para Ativo, isso também precisa ser registrado
automaticamente. Não deve ser necessário entrar no histórico e escrever a
mudança manualmente.

Já existe um botão de histórico, mas as ações do chip não estão sendo
registradas corretamente. O histórico deve mostrar todos os registros
automáticos e continuar permitindo anotações manuais.

Também precisa existir uma coluna de Próxima recarga. Ela é calculada pela data
da Última recarga somada ao Ciclo de recarga, em dias. Visualmente, deve surgir
um alerta quando o chip estiver perto da recarga ou com a recarga vencida.

Os alertas precisam representar ações agendadas: depois das 24 horas, chamar a
atenção para a verificação manual da liberação; na data da recarga, chamar a
atenção para recarregar o chip.

### `clave 05.ogg`

Nenhum cliente preencheu o QFD ainda porque essa parte não estava concluída. A
nomenclatura não deve parecer uma cópia da Ladeira. Deve usar os nomes
tradicionais do marketing. O documento contém o mapeamento, a descrição e o
texto cinza que deve orientar o preenchimento. É importante apontar as fontes
originais dos conceitos.

## Nomenclatura e textos do QFD

### Mecanismo Único

Mapeamento anterior: `Método (Furadeira)`.

Placeholder:

> Qual é o seu processo, sistema ou algoritmo proprietário? Ex: Método Clave.

Texto de apoio:

> O mecanismo é o motivo pelo qual o seu método funciona e é diferente de tudo
> que já existe no mercado. O conceito vem da publicidade direto-resposta
> clássica. Eugene Schwartz já descrevia esse elemento central em
> *Breakthrough Advertising* (1966).

### Resultado-Alvo

Mapeamento anterior: `Quadro na Parede (Resultado Visual)`.

Placeholder:

> Descreva o resultado final, específico e mensurável, que o seu cliente
> alcança. Qual o marco ou troféu?

Texto de apoio:

> É o resultado específico que a metodologia entrega, não o método em si. A
> ideia se relaciona à formulação atribuída a Theodore Levitt sobre o cliente
> querer o resultado, não a ferramenta, e ao framework Jobs-to-be-Done
> difundido por Clayton Christensen.

### Benefício Estendido

Mapeamento anterior: `Argumentos Estratégicos`.

Placeholder:

> O que o cliente realmente busca por trás do resultado-alvo? (status,
> segurança, liberdade, pertencimento...)

Texto de apoio:

> É o motivo emocional mais profundo por trás do resultado prometido. O
> conceito se relaciona à Means-End Chain Theory, de Jonathan Gutman (1982),
> usada para conectar atributos de produto a valores humanos.

## Critérios de aceite consolidados

- O projeto selecionado permanece ativo após atualização da página, desde que o
  usuário ainda tenha acesso a ele.
- Cada vínculo em `project_users` possui uma lista de módulos permitidos.
- Nome, e-mail, projeto e módulos são definidos em uma única operação.
- Contas novas recebem convite para definir a senha; contas existentes são
  vinculadas ou reativadas sem duplicação.
- Administradores conseguem liberar ou retirar módulos por pessoa e projeto.
- O menu, os atalhos do Dashboard e o banco respeitam a mesma permissão.
- Comunicação começa por uma lista de produtos/cursos.
- Todas as abas e todos os campos de Comunicação pertencem ao produto
  selecionado.
- Os textos antigos de Comunicação são preservados em `Produto principal`.
- Chips aceitam o status `Restrição 24h`.
- Cadastro, mudança de status, encerramento de restrição e recarga geram eventos
  automáticos com data e hora.
- Anotações manuais são persistidas no mesmo histórico normalizado.
- A próxima recarga é calculada por `ultima_recarga + periodicidade`.
- A interface sinaliza restrição vencida, recarga próxima e recarga vencida.
