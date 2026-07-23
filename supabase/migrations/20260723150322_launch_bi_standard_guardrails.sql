-- Enforce one BI dashboard URL per launch standard across current and future launches.

do $$
begin
  if exists (
    select 1
    from public.launch_bi_integrations i
    join public.lancamentos l on l.id = i.lancamento_id
    where l.project_id <> i.project_id
  ) then
    raise exception 'Existem integrações de BI vinculadas a um projeto diferente do lançamento.';
  end if;

  if exists (
    select 1
    from public.launch_bi_integrations
    group by dashboard_url
    having count(*) > 1
  ) then
    raise exception 'Existem dashboards de BI repetidos em mais de um lançamento.';
  end if;

  if exists (
    select 1
    from public.launch_bi_integrations
    where provider = 'b16_dashboard'
      and (
        external_launch_code <> '0726'
        or dashboard_url !~ '^https://suporteb16-collab\.github\.io/dashboard-b16-cnp0426/?$'
      )
  ) then
    raise exception 'Existem integrações b16_dashboard fora do padrão legado CNP 2 - 2026.';
  end if;
end;
$$;

create unique index if not exists launch_bi_integrations_dashboard_url_unique
  on public.launch_bi_integrations (dashboard_url);

alter table public.launch_bi_integrations
  drop constraint if exists launch_bi_integrations_dashboard_url_https_strict_check;

alter table public.launch_bi_integrations
  add constraint launch_bi_integrations_dashboard_url_https_strict_check
  check (dashboard_url ~ '^https://[^[:space:]]+$');

alter table public.launch_bi_integrations
  drop constraint if exists launch_bi_integrations_provider_contract_check;

alter table public.launch_bi_integrations
  add constraint launch_bi_integrations_provider_contract_check
  check (
    (
      provider = 'b16_dashboard'
      and external_launch_code = '0726'
      and dashboard_url ~ '^https://suporteb16-collab\.github\.io/dashboard-b16-cnp0426/?$'
    )
    or (
      provider in ('auto_dashboard', 'farol_e_forja_dashboard')
      and external_launch_code <> 'external'
      and dashboard_url ~ '^https://suporteb16-collab\.github\.io/[^[:space:]]+$'
    )
    or (
      provider = 'external_dashboard'
      and external_launch_code = 'external'
      and last_synced_at is null
      and last_snapshot is null
    )
  );
