-- Allow dashboards that follow the public B16 BI contract to be discovered automatically.

alter table public.launch_bi_integrations
  drop constraint if exists launch_bi_integrations_provider_check;

alter table public.launch_bi_integrations
  add constraint launch_bi_integrations_provider_check
  check (
    provider in (
      'b16_dashboard',
      'farol_e_forja_dashboard',
      'auto_dashboard',
      'external_dashboard'
    )
  );
