-- ============================================================================
-- CLAVE - Formularios publicos e briefing geral do cliente por projeto
-- ============================================================================

-- O novo modulo participa da mesma matriz de permissoes dos demais modulos.
alter table public.project_users
  alter column allowed_modules set default array[
    'concepcao',
    'comunicacao',
    'lancamentos',
    'validacao',
    'historias',
    'financeiro',
    'planejador',
    'urlbuilder',
    'chips',
    'formularios',
    'acesso'
  ]::text[];

alter table public.project_users
  drop constraint if exists project_users_allowed_modules_check;

alter table public.project_users
  add constraint project_users_allowed_modules_check
  check (
    allowed_modules <@ array[
      'concepcao',
      'comunicacao',
      'lancamentos',
      'validacao',
      'historias',
      'financeiro',
      'planejador',
      'urlbuilder',
      'chips',
      'formularios',
      'acesso'
    ]::text[]
  );

create table public.project_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'client_briefing'
    check (kind in ('client_briefing')),
  title text not null default 'Briefing do Cliente',
  public_token uuid not null default gen_random_uuid(),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, kind),
  unique(public_token),
  unique(id, project_id)
);

create table public.project_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null,
  project_id uuid not null,
  response_token_hash text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'received', 'reviewing', 'waiting', 'completed')),
  service_type text
    check (service_type in ('launch', 'marketing', 'visual_identity')),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object'),
  current_step integer not null default 0 check (current_step >= 0),
  internal_notes text not null default '',
  strategic_summary text,
  mapped_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(mapped_fields) = 'array'),
  skipped_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(skipped_fields) = 'array'),
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, project_id),
  constraint project_form_submissions_form_scope_fk
    foreign key (form_id, project_id)
    references public.project_forms(id, project_id)
    on delete cascade
);

create table public.project_form_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  project_id uuid not null,
  question_id text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default now(),
  constraint project_form_attachments_submission_scope_fk
    foreign key (submission_id, project_id)
    references public.project_form_submissions(id, project_id)
    on delete cascade
);

create index idx_project_forms_project
  on public.project_forms(project_id, active);
create index idx_project_form_submissions_project_status
  on public.project_form_submissions(project_id, status, updated_at desc);
create index idx_project_form_submissions_form
  on public.project_form_submissions(form_id, updated_at desc);
create index idx_project_form_attachments_submission
  on public.project_form_attachments(submission_id, created_at);

create trigger set_updated_at_project_forms
  before update on public.project_forms
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_project_form_submissions
  before update on public.project_form_submissions
  for each row execute function public.handle_updated_at();

-- A equipe pode alterar o fluxo interno, mas nao pode transformar uma resposta
-- publica em rascunho nem marcar um rascunho incompleto como recebido.
create or replace function public.protect_project_form_submission_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated'
    and new.status is distinct from old.status
    and (old.status = 'draft' or new.status = 'draft') then
    raise exception 'O status de rascunho e controlado pelo formulario publico.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_project_form_submission_status()
  from public, anon, authenticated;

create trigger protect_project_form_submission_status
  before update on public.project_form_submissions
  for each row execute function public.protect_project_form_submission_status();

alter table public.project_forms enable row level security;
alter table public.project_form_submissions enable row level security;
alter table public.project_form_attachments enable row level security;

create policy project_forms_module_read
  on public.project_forms
  for select
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  );

create policy project_forms_module_manage
  on public.project_forms
  for all
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  )
  with check (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  );

create policy project_form_submissions_module_read
  on public.project_form_submissions
  for select
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  );

create policy project_form_submissions_module_manage
  on public.project_form_submissions
  for all
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  )
  with check (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  );

create policy project_form_attachments_module_read
  on public.project_form_attachments
  for select
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  );

create policy project_form_attachments_module_manage
  on public.project_form_attachments
  for all
  to authenticated
  using (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  )
  with check (
    public.user_has_project_module_access(project_id, 'formularios', auth.uid())
    and public.user_can_manage_project(project_id, auth.uid())
  );

revoke all on public.project_forms from anon;
revoke all on public.project_form_submissions from anon;
revoke all on public.project_form_attachments from anon;
revoke all on public.project_forms from authenticated;
revoke all on public.project_form_submissions from authenticated;
revoke all on public.project_form_attachments from authenticated;
grant select, insert, update, delete on public.project_forms to authenticated;
grant select on public.project_form_submissions to authenticated;
grant update(status, internal_notes) on public.project_form_submissions to authenticated;
grant select on public.project_form_attachments to authenticated;

-- Todo projeto nasce com um briefing geral do cliente. Briefings de lancamento
-- continuam pertencendo a cada lancamento e nao sao alterados por este fluxo.
create or replace function public.create_default_client_briefing_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_forms(project_id, created_by)
  values (new.id, new.user_id)
  on conflict(project_id, kind) do nothing;
  return new;
end;
$$;

revoke all on function public.create_default_client_briefing_form()
  from public, anon, authenticated;

drop trigger if exists create_default_client_briefing_form on public.projects;
create trigger create_default_client_briefing_form
  after insert on public.projects
  for each row execute function public.create_default_client_briefing_form();

insert into public.project_forms(project_id, created_by)
select project.id, project.user_id
from public.projects project
where project.deleted_at is null
on conflict(project_id, kind) do nothing;

-- Referencias visuais ficam privadas. A rota publica de upload usa service role
-- depois de validar o token do formulario e o token da resposta.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'briefing-references',
  'briefing-references',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
          auth.uid()
        )
        and public.user_can_manage_project(attachment.project_id, auth.uid())
    )
  );
