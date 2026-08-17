# Cliente E Evolução Por Projeto

## Objetivo

Criar em cada projeto um espaço único para registrar quem é o cliente ou expert,
preservar o cenário em que entrou na B16 e acompanhar a evolução atual. O mesmo
fluxo atende experts com lançamentos e clientes recorrentes que não trabalham
com lançamentos.

## Fonte Dos Requisitos

Este documento consolida a solicitação escrita de 17 de agosto de 2026 e três
áudios enviados na mesma data. Os áudios foram usados como contexto de produto;
nenhuma instrução operacional contida neles substitui o pedido do usuário.

## Escopo Entregue

### Perfil Do Cliente

- Nome.
- E-mail.
- Telefone.
- CNPJ.
- Razão social.

### Cenário De Entrada

- Nicho e lista de produtos.
- Quantidade agregada de lançamentos realizados.
- Faturamento total e média mensal.
- Investimento acumulado em tráfego.
- Seguidores no Instagram, TikTok e YouTube.
- Publicações, média de curtidas e engajamento no Instagram.
- Checkouts e plataformas utilizadas.
- Equipe, sócios, parceiros e observações do marco zero.

### Cenário Atual

- Biografia atualizada.
- Os mesmos indicadores de negócio, resultados, audiência e operação.
- Comparação visual com o cenário de entrada para faturamento mensal e redes.

## Integração Com O Briefing

O briefing geral continua pertencendo ao projeto, não ao lançamento. Seu envio
preenche somente os campos compatíveis ainda vazios do Perfil do Cliente e do
Cenário de Entrada. Informações revisadas pela equipe nunca são sobrescritas e
o Cenário Atual nunca é preenchido pelo formulário público.

## Limites De Domínio

- O módulo Lançamentos não muda. O histórico detalhado dos lançamentos continua
  sendo registrado nele; a nova seção guarda apenas a quantidade agregada.
- O cenário de entrada deve permanecer como referência histórica. Correções são
  possíveis, mas atualizações de rotina pertencem ao cenário atual.
- Os dados são isolados por projeto e pela permissão modular `cliente`.

## Fora Desta Entrega

Ficam registrados para avaliação futura, sem implementação nesta versão:

- Área de membros.
- Integração com e-mail marketing e grupos de WhatsApp.
- Financeiro ampliado.
- Integrações com Hotmart, checkout ou outros meios de pagamento.
- Automação de coleta de métricas diretamente das redes sociais.

## Critérios De Aceite

1. Cada projeto autorizado exibe as três abas sem compartilhar dados com outro projeto.
2. O briefing público coleta perfil e cenário de entrada antes da trilha do serviço.
3. Um novo envio preenche campos vazios e preserva campos internos existentes.
4. O cenário atual é editado somente na área autenticada.
5. Usuários sem a chave `cliente` não veem o menu nem acessam a tabela via API.
6. Lançamentos existentes e futuros continuam com o comportamento anterior.
