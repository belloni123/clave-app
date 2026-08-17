alter table public.app_error_events
  add column stack_trace text
  check (stack_trace is null or char_length(stack_trace) <= 12000);

comment on column public.app_error_events.stack_trace is
  'Stack trace sanitizada, visível somente para administradores pela RLS da tabela.';
