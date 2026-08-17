-- Corrige a expressão original, que armazenou barras duplicadas e passou a
-- exigir caracteres inexistentes no telefone formatado pelo formulário.
alter table public.expert_applications
  drop constraint expert_applications_whatsapp_check;

alter table public.expert_applications
  add constraint expert_applications_whatsapp_check
  check (whatsapp ~ '^[(][1-9][1-9][)] 9[0-9]{4}-[0-9]{4}$')
  not valid;

alter table public.expert_applications
  validate constraint expert_applications_whatsapp_check;
