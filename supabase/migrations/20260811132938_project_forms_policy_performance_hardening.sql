-- ============================================================================
-- CLAVE - Indices e politicas sem sobreposicao para formularios publicos
-- ============================================================================

create index if not exists idx_project_forms_created_by
  on public.project_forms(created_by)
  where created_by is not null;

create index if not exists idx_project_form_submissions_form_scope
  on public.project_form_submissions(form_id, project_id);

create index if not exists idx_project_form_attachments_submission_scope
  on public.project_form_attachments(submission_id, project_id);

create index if not exists expert_applications_converted_by_idx
  on public.expert_applications(converted_by)
  where converted_by is not null;

-- Politicas FOR ALL tambem participam do SELECT. Separar cada operacao evita
-- duas politicas permissivas equivalentes e permite ao Postgres inicializar o
-- usuario autenticado apenas uma vez por consulta.
drop policy if exists project_forms_module_read on public.project_forms;
drop policy if exists project_forms_module_manage on public.project_forms;

create policy project_forms_module_read
  on public.project_forms
  for select
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

create policy project_forms_module_insert
  on public.project_forms
  for insert
  to authenticated
  with check (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

create policy project_forms_module_update
  on public.project_forms
  for update
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  )
  with check (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

create policy project_forms_module_delete
  on public.project_forms
  for delete
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

drop policy if exists project_form_submissions_module_read
  on public.project_form_submissions;
drop policy if exists project_form_submissions_module_manage
  on public.project_form_submissions;

create policy project_form_submissions_module_read
  on public.project_form_submissions
  for select
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

create policy project_form_submissions_module_update
  on public.project_form_submissions
  for update
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  )
  with check (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

drop policy if exists project_form_attachments_module_read
  on public.project_form_attachments;
drop policy if exists project_form_attachments_module_manage
  on public.project_form_attachments;

create policy project_form_attachments_module_read
  on public.project_form_attachments
  for select
  to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'formularios',
      (select auth.uid())
    )
    and public.user_can_manage_project(project_id, (select auth.uid()))
  );

drop policy if exists briefing_references_internal_read on storage.objects;
create policy briefing_references_internal_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'briefing-references'
    and exists (
      select 1
      from public.project_form_attachments attachment
      where attachment.storage_path = name
        and public.user_has_project_module_access(
          attachment.project_id,
          'formularios',
          (select auth.uid())
        )
        and public.user_can_manage_project(
          attachment.project_id,
          (select auth.uid())
        )
    )
  );
