-- Allow each launch to register an external dashboard without reusing B16 data.

alter table public.launch_bi_integrations
  drop constraint if exists launch_bi_integrations_provider_check;

alter table public.launch_bi_integrations
  add constraint launch_bi_integrations_provider_check
  check (provider in ('b16_dashboard', 'external_dashboard'));
