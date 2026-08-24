-- Project-owned AI credentials, protected by Supabase Vault, and private
-- audio attachments for the storytelling bank.

create table if not exists public.project_ai_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  active_provider text not null default 'openai'
    check (active_provider in ('openai', 'anthropic')),
  openai_secret_id uuid,
  openai_key_hint text check (openai_key_hint is null or length(openai_key_hint) = 4),
  openai_verified_at timestamptz,
  anthropic_secret_id uuid,
  anthropic_key_hint text check (anthropic_key_hint is null or length(anthropic_key_hint) = 4),
  anthropic_verified_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_ai_settings enable row level security;

-- Credentials are only handled by authenticated server routes. Even secret
-- identifiers are intentionally unavailable to browser roles.
revoke all on table public.project_ai_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.project_ai_settings to service_role;

drop trigger if exists set_project_ai_settings_updated_at on public.project_ai_settings;
create trigger set_project_ai_settings_updated_at
before update on public.project_ai_settings
for each row execute function public.handle_updated_at();

create or replace function public.set_project_ai_secret(
  p_project_id uuid,
  p_provider text,
  p_secret_id uuid,
  p_secret_value text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_name text;
  v_description text;
begin
  if p_provider not in ('openai', 'anthropic') then
    raise exception 'Unsupported AI provider';
  end if;

  if p_secret_value is null or length(trim(p_secret_value)) < 8 then
    raise exception 'AI secret cannot be empty';
  end if;

  if p_secret_id is null then
    v_secret_id := vault.create_secret(
      trim(p_secret_value),
      'clave_project_ai_' || p_project_id::text || '_' || p_provider || '_' || gen_random_uuid()::text,
      'Clave project AI key for ' || p_provider,
      null
    );
  else
    select name, description
      into v_name, v_description
      from vault.decrypted_secrets
     where id = p_secret_id;

    if v_name is null then
      raise exception 'AI secret not found';
    end if;

    perform vault.update_secret(
      p_secret_id,
      trim(p_secret_value),
      v_name,
      v_description,
      null
    );
    v_secret_id := p_secret_id;
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.get_project_ai_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where id = p_secret_id;
$$;

create or replace function public.delete_project_ai_secret(p_secret_id uuid)
returns void
language sql
security definer
set search_path = public, vault
as $$
  delete from vault.secrets where id = p_secret_id;
$$;

revoke all on function public.set_project_ai_secret(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_project_ai_secret(uuid)
  from public, anon, authenticated;
revoke all on function public.delete_project_ai_secret(uuid)
  from public, anon, authenticated;
grant execute on function public.set_project_ai_secret(uuid, text, uuid, text)
  to service_role;
grant execute on function public.get_project_ai_secret(uuid)
  to service_role;
grant execute on function public.delete_project_ai_secret(uuid)
  to service_role;

alter table public.stories
  add column if not exists audio_storage_path text,
  add column if not exists audio_original_name text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_size_bytes bigint,
  add column if not exists transcribed_at timestamptz;

alter table public.stories
  drop constraint if exists stories_audio_size_bytes_check;
alter table public.stories
  add constraint stories_audio_size_bytes_check
  check (
    audio_size_bytes is null
    or (audio_size_bytes > 0 and audio_size_bytes <= 26214400)
  );

-- Align database enforcement with the module permissions shown by the UI.
drop policy if exists "Acesso ao projeto para histórias" on public.stories;
drop policy if exists "stories_select_module" on public.stories;
drop policy if exists "stories_insert_module" on public.stories;
drop policy if exists "stories_update_module" on public.stories;
drop policy if exists "stories_delete_module" on public.stories;

create policy "stories_select_module"
  on public.stories for select to authenticated
  using (public.user_has_project_module_access(project_id, 'historias', auth.uid()));

create policy "stories_insert_module"
  on public.stories for insert to authenticated
  with check (public.user_has_project_module_access(project_id, 'historias', auth.uid()));

create policy "stories_update_module"
  on public.stories for update to authenticated
  using (public.user_has_project_module_access(project_id, 'historias', auth.uid()))
  with check (public.user_has_project_module_access(project_id, 'historias', auth.uid()));

create policy "stories_delete_module"
  on public.stories for delete to authenticated
  using (public.user_has_project_module_access(project_id, 'historias', auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'story-audio',
  'story-audio',
  false,
  26214400,
  array[
    'audio/flac',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/x-wav',
    'video/mp4'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.story_audio_project_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.story_audio_project_id(text) from public, anon;
grant execute on function public.story_audio_project_id(text) to authenticated;

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
      auth.uid()
    )
  );

create policy "story_audio_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'story-audio'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.user_has_project_module_access(
      public.story_audio_project_id(name),
      'historias',
      auth.uid()
    )
  );

create policy "story_audio_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'story-audio'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.user_can_administer_project(
        public.story_audio_project_id(name),
        auth.uid()
      )
    )
  );

comment on table public.project_ai_settings is
  'Project-scoped AI metadata. Provider keys are encrypted in Supabase Vault and are never exposed to browser roles.';
comment on column public.stories.audio_storage_path is
  'Private Supabase Storage path in the story-audio bucket.';
