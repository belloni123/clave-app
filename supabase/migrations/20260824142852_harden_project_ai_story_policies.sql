-- Remove a legacy duplicate policy and keep story/audio checks efficient as
-- the project grows. The AI settings table remains intentionally server-only.

create index if not exists project_ai_settings_updated_by_idx
  on public.project_ai_settings (updated_by)
  where updated_by is not null;

drop policy if exists "module_historias_stories" on public.stories;
drop policy if exists "stories_select_module" on public.stories;
drop policy if exists "stories_insert_module" on public.stories;
drop policy if exists "stories_update_module" on public.stories;
drop policy if exists "stories_delete_module" on public.stories;

create policy "stories_select_module"
  on public.stories for select to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'historias',
      (select auth.uid())
    )
  );

create policy "stories_insert_module"
  on public.stories for insert to authenticated
  with check (
    public.user_has_project_module_access(
      project_id,
      'historias',
      (select auth.uid())
    )
  );

create policy "stories_update_module"
  on public.stories for update to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'historias',
      (select auth.uid())
    )
  )
  with check (
    public.user_has_project_module_access(
      project_id,
      'historias',
      (select auth.uid())
    )
  );

create policy "stories_delete_module"
  on public.stories for delete to authenticated
  using (
    public.user_has_project_module_access(
      project_id,
      'historias',
      (select auth.uid())
    )
  );

drop policy if exists "story_audio_select" on storage.objects;
drop policy if exists "story_audio_insert" on storage.objects;
drop policy if exists "story_audio_delete" on storage.objects;

create policy "story_audio_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'story-audio'
    and public.user_has_project_module_access(
      public.story_audio_project_id(name),
      'historias',
      (select auth.uid())
    )
  );

create policy "story_audio_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'story-audio'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.user_has_project_module_access(
      public.story_audio_project_id(name),
      'historias',
      (select auth.uid())
    )
  );

create policy "story_audio_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'story-audio'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.user_can_administer_project(
        public.story_audio_project_id(name),
        (select auth.uid())
      )
    )
  );
