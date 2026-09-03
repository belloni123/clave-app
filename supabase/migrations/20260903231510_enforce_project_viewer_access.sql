-- Complement existing module policies with a restrictive write gate. Never grants
-- access to a module: its original permissive policy must also allow the action.
create or replace function public.user_can_edit_project(proj_id uuid)
returns boolean
language sql stable security invoker
set search_path = public
as $$
  select auth.uid() is not null and (
    public.user_can_administer_project(proj_id, auth.uid())
    or exists (
      select 1 from public.project_users pu
      where pu.project_id = proj_id and pu.user_id = auth.uid()
        and pu.ativo and pu.permission_level = 'editor'
    )
  );
$$;
revoke all on function public.user_can_edit_project(uuid) from public, anon;
grant execute on function public.user_can_edit_project(uuid) to authenticated;

-- Keep the explicit list reviewable; administrative/service-only tables keep
-- their own rules. project_users is intentionally excluded to avoid recursion.
do $$
declare
  table_name text;
  predicate text;
begin
  foreach table_name in array array[
    'ads', 'briefings', 'calendar_events', 'chip_events', 'chips',
    'communication_products', 'financial_data', 'lancamentos',
    'launch_checklists', 'matrix_answers', 'pricing_scenarios',
    'project_client_profiles', 'project_forms', 'stories', 'text_fields'
  ] loop
    execute format('create policy project_editor_insert on public.%I as restrictive for insert to authenticated with check (public.user_can_edit_project(project_id))', table_name);
    execute format('create policy project_editor_update on public.%I as restrictive for update to authenticated using (public.user_can_edit_project(project_id)) with check (public.user_can_edit_project(project_id))', table_name);
    execute format('create policy project_editor_delete on public.%I as restrictive for delete to authenticated using (public.user_can_edit_project(project_id))', table_name);
  end loop;
  foreach table_name in array array[
    'communication_product_fields', 'lancamentos_cronograma',
    'lancamentos_investimentos', 'lancamentos_provisionamento', 'lancamentos_realizado'
  ] loop
    if table_name = 'communication_product_fields' then
      predicate := 'exists (select 1 from public.communication_products parent where parent.id = product_id and public.user_can_edit_project(parent.project_id))';
    else
      predicate := 'exists (select 1 from public.lancamentos parent where parent.id = lancamento_id and public.user_can_edit_project(parent.project_id))';
    end if;
    execute format('create policy project_editor_insert on public.%I as restrictive for insert to authenticated with check (%s)', table_name, predicate);
    execute format('create policy project_editor_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)', table_name, predicate, predicate);
    execute format('create policy project_editor_delete on public.%I as restrictive for delete to authenticated using (%s)', table_name, predicate);
  end loop;
end;
$$;

-- Legacy colab_assignments must not resurrect a project after its membership
-- has been revoked. Ownership and agency/global administrators still work.
create policy projects_active_membership on public.projects
  as restrictive for select to authenticated
  using (public.user_has_project_access(id, (select auth.uid())));

create policy story_audio_editor_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'story-audio' or
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.user_can_edit_project(((storage.foldername(name))[1])::uuid)
      else false end
  );
create policy story_audio_editor_update on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'story-audio' or
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.user_can_edit_project(((storage.foldername(name))[1])::uuid)
      else false end
  )
  with check (
    bucket_id <> 'story-audio' or
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.user_can_edit_project(((storage.foldername(name))[1])::uuid)
      else false end
  );
create policy story_audio_editor_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'story-audio' or
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.user_can_edit_project(((storage.foldername(name))[1])::uuid)
      else false end
  );
