# Onboarding Público B16

## Objetivo

Disponibilizar uma experiência pública pós-contrato que recepcione o cliente,
explique a metodologia PD3 e organize as expectativas para o início do trabalho
com a Agência B16.

## Rota E Escopo

* A rota canônica é `/onboarding` e funciona sem autenticação.
* O conteúdo é institucional e igual para todos os clientes nesta versão.
* A página não recebe dados, não chama APIs e não acessa o Supabase.
* A metadata usa título e descrição próprios, além de `noindex, nofollow`.

## Conteúdo

1. Abertura com “Seu projeto começa aqui” e explicação breve do onboarding.
2. Apresentação da Metodologia PD3 sem atribuir significado às letras ou ao número.
3. Quatro fundamentos: imersão, organização, prioridades e alinhamento.
4. Materiais divididos entre identidade, conteúdo, provas e plataformas.
5. Aviso para o compartilhamento seguro de credenciais.
6. Acordos de colaboração, comunicação, responsáveis, feedbacks e prazos.

## Direção Visual

A interface mantém a tipografia DM Sans, o contraste preto/off-white e o
amarelo B16. Verde, azul e coral aparecem apenas como acentos funcionais. As
seções são faixas de página, enquanto cards são reservados aos fundamentos e
aos grupos de materiais.

As imagens `onboarding-hero.webp` e `onboarding-methodology.webp` foram geradas
exclusivamente para a página com direção editorial comum e convertidas para
WebP. A primeira representa a colaboração no começo de uma jornada; a segunda,
a organização de uma estratégia adaptável.

## Acessibilidade E Desempenho

* HTML semântico com hierarquia de títulos e textos alternativos descritivos.
* Link interno navegável por teclado e com foco visível.
* Ícones decorativos marcados com `aria-hidden`.
* Imagem principal prioritária; imagem abaixo da primeira tela carregada de forma tardia.
* Dimensões responsivas estáveis para evitar mudanças de layout.
* Animações discretas por interseção, desativadas com `prefers-reduced-motion`.

## Critérios De Aceite

1. A rota abre sem sessão em desktop e smartphone.
2. Nenhum texto fica cortado, sobreposto ou fora da viewport.
3. As duas imagens carregam e mantêm enquadramento adequado.
4. O link “Conheça o processo” recebe foco e navega para Metodologia PD3.
5. O conteúdo permanece legível com redução de movimento ativada.
6. A página não gera erros no console nem requisições ao Supabase.
7. O HTML inclui título, descrição e diretiva `noindex, nofollow`.
8. Build, verificação de tipos, lint focado e auditoria de produção são aprovados.
