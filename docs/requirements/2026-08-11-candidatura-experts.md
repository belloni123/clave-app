# Candidatura de Experts — Agência B16

## Objetivo

Disponibilizar uma página pública para leads abordados por Instagram, WhatsApp
ou outros canais. Cada resposta deve permanecer como candidatura independente
até que um administrador decida convertê-la em projeto.

## Fluxo Público

1. A rota pública é `/candidatura` e não exige login.
2. A primeira etapa apresenta a B16, seus experts e a autorização de uso dos dados.
3. A recusa encerra o fluxo sem solicitar ou armazenar dados pessoais.
4. A segunda etapa exige todos os campos definidos no formulário comercial e o consentimento LGPD.
5. O envio só exibe sucesso depois da persistência confirmada pelo servidor.
6. Em falha, as respostas permanecem na página para uma nova tentativa.

## Fluxo Interno

1. Apenas administradores veem o módulo global `Candidaturas`.
2. A equipe pode buscar, filtrar, classificar, anotar e consultar a resposta integral.
3. `Criar projeto` sugere o nome do expert e permite escolher a cor.
4. A conversão cria um projeto e vincula a candidatura original de forma atômica.
5. A mesma candidatura nunca pode originar dois projetos.
6. O projeto criado recebe o Briefing do Cliente pelo fluxo padrão; lançamentos e seus briefings não são criados automaticamente.

## Segurança E Privacidade

* Nenhuma resposta é enviada a terceiros.
* `anon` não acessa as tabelas de candidatura.
* Validação acontece no navegador e novamente no servidor.
* O WhatsApp é normalizado e validado como celular brasileiro no formato `(DD) 9XXXX-XXXX` nas duas camadas.
* Idempotência, campo-armadilha, tempo mínimo e limite horário reduzem abuso.
* Consentimento, data de envio e histórico de conversão são persistidos.
