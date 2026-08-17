alter table public.app_error_events
  drop constraint app_error_events_reference_code_check;

alter table public.app_error_events
  add constraint app_error_events_reference_code_check
  check (reference_code ~ '^CLV-[A-F0-9]{8,12}$'),
  add column actor_id uuid references public.profiles(id) on delete set null;

create index app_error_events_actor_occurred_idx
  on public.app_error_events(actor_id, occurred_at desc)
  where actor_id is not null;

comment on column public.app_error_events.actor_id is
  'Usuário autenticado no momento da falha, quando houver sessão válida.';
