-- ==========================================================================
-- CLAVE - Integridade relacional das fontes de BI por projeto
-- ==========================================================================

do $$
begin
  if exists (
    select 1
    from public.launch_bi_integrations integration
    join public.lancamentos launch on launch.id = integration.lancamento_id
    where launch.project_id <> integration.project_id
  ) then
    raise exception 'Existem integrações de BI vinculadas a um projeto diferente do lançamento.';
  end if;

  if exists (
    select 1
    from public.launch_bi_snapshots snapshot
    join public.lancamentos launch on launch.id = snapshot.lancamento_id
    join public.launch_bi_integrations integration on integration.id = snapshot.integration_id
    where snapshot.project_id <> launch.project_id
       or snapshot.project_id <> integration.project_id
       or snapshot.lancamento_id <> integration.lancamento_id
  ) then
    raise exception 'Existem snapshots de BI com referências inconsistentes.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lancamentos_id_project_key'
      and conrelid = 'public.lancamentos'::regclass
  ) then
    alter table public.lancamentos
      add constraint lancamentos_id_project_key unique (id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'launch_bi_integrations_launch_project_fk'
      and conrelid = 'public.launch_bi_integrations'::regclass
  ) then
    alter table public.launch_bi_integrations
      add constraint launch_bi_integrations_launch_project_fk
      foreign key (lancamento_id, project_id)
      references public.lancamentos (id, project_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'launch_bi_integrations_id_launch_project_key'
      and conrelid = 'public.launch_bi_integrations'::regclass
  ) then
    alter table public.launch_bi_integrations
      add constraint launch_bi_integrations_id_launch_project_key
      unique (id, lancamento_id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'launch_bi_snapshots_integration_scope_fk'
      and conrelid = 'public.launch_bi_snapshots'::regclass
  ) then
    alter table public.launch_bi_snapshots
      add constraint launch_bi_snapshots_integration_scope_fk
      foreign key (integration_id, lancamento_id, project_id)
      references public.launch_bi_integrations (id, lancamento_id, project_id)
      on delete cascade;
  end if;
end;
$$;
