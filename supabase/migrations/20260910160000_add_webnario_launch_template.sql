-- Permite criar lançamentos no formato Webnário.
-- Os detalhes do briefing são armazenados no JSONB `oferta`.

alter table public.lancamentos
  drop constraint if exists lancamentos_template_check;

alter table public.lancamentos
  add constraint lancamentos_template_check
  check (
    template in (
      'lancamento',
      'evento_pago',
      'pico_perpetuo',
      'evento_presencial',
      'lancamento_interno',
      'lancamento_meteorico',
      'webnario'
    )
  );
