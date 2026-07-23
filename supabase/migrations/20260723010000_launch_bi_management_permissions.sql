-- ==========================================================================
-- CLAVE - Permissoes de gestao para integracoes de BI
-- ==========================================================================

create or replace function public.user_can_manage_project(proj_id uuid, usr_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles profile
      where profile.id = usr_id
        and profile.role = 'admin'
        and profile.deleted_at is null
    )
    or exists (
      select 1
      from public.profiles profile
      join public.projects project on project.id = proj_id
      where profile.id = usr_id
        and profile.agency_id = project.agency_id
        and profile.agency_role in ('admin', 'gestor')
        and profile.deleted_at is null
    )
    or exists (
      select 1
      from public.projects project
      where project.id = proj_id
        and project.user_id = usr_id
    )
    or exists (
      select 1
      from public.project_users project_user
      where project_user.project_id = proj_id
        and project_user.user_id = usr_id
        and project_user.ativo
        and project_user.permission_level in ('editor', 'admin')
    );
$$;

drop policy if exists "launch_bi_integrations_policy" on public.launch_bi_integrations;
drop policy if exists "launch_bi_integrations_select" on public.launch_bi_integrations;
drop policy if exists "launch_bi_integrations_insert" on public.launch_bi_integrations;
drop policy if exists "launch_bi_integrations_update" on public.launch_bi_integrations;
drop policy if exists "launch_bi_integrations_delete" on public.launch_bi_integrations;

create policy "launch_bi_integrations_select" on public.launch_bi_integrations
  for select
  using (public.user_has_project_access(project_id, auth.uid()));

create policy "launch_bi_integrations_insert" on public.launch_bi_integrations
  for insert
  with check (public.user_can_manage_project(project_id, auth.uid()));

create policy "launch_bi_integrations_update" on public.launch_bi_integrations
  for update
  using (public.user_can_manage_project(project_id, auth.uid()))
  with check (public.user_can_manage_project(project_id, auth.uid()));

create policy "launch_bi_integrations_delete" on public.launch_bi_integrations
  for delete
  using (public.user_can_manage_project(project_id, auth.uid()));

drop policy if exists "launch_bi_snapshots_policy" on public.launch_bi_snapshots;
drop policy if exists "launch_bi_snapshots_select" on public.launch_bi_snapshots;
drop policy if exists "launch_bi_snapshots_insert" on public.launch_bi_snapshots;
drop policy if exists "launch_bi_snapshots_update" on public.launch_bi_snapshots;
drop policy if exists "launch_bi_snapshots_delete" on public.launch_bi_snapshots;

create policy "launch_bi_snapshots_select" on public.launch_bi_snapshots
  for select
  using (public.user_has_project_access(project_id, auth.uid()));

create policy "launch_bi_snapshots_insert" on public.launch_bi_snapshots
  for insert
  with check (public.user_can_manage_project(project_id, auth.uid()));

create policy "launch_bi_snapshots_update" on public.launch_bi_snapshots
  for update
  using (public.user_can_manage_project(project_id, auth.uid()))
  with check (public.user_can_manage_project(project_id, auth.uid()));

create policy "launch_bi_snapshots_delete" on public.launch_bi_snapshots
  for delete
  using (public.user_can_manage_project(project_id, auth.uid()));
