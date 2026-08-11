-- ============================================================================
-- CLAVE - Candidaturas publicas de experts e conversao segura em projeto
-- ============================================================================

create table public.expert_applications (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  full_name text not null check (char_length(full_name) between 3 and 120),
  whatsapp text not null check (whatsapp ~ '^\\([1-9][0-9]\\) 9?[0-9]{4}-[0-9]{4}$'),
  email text not null check (char_length(email) <= 254),
  instagram text not null check (char_length(instagram) between 2 and 300),
  other_platforms text[] not null default '{}'
    check (
      other_platforms <@ array['youtube', 'facebook', 'linkedin', 'tiktok']::text[]
      and cardinality(other_platforms) > 0
    ),
  niche text not null check (char_length(niche) between 2 and 3000),
  work_and_pains text not null check (char_length(work_and_pains) between 10 and 6000),
  competitor_reference text not null check (char_length(competitor_reference) between 2 and 3000),
  digital_products text[] not null
    check (
      digital_products <@ array[
        'none', 'ebook', 'masterclass', 'course', 'community', 'consulting',
        'mentoring', 'in_person_event'
      ]::text[]
      and cardinality(digital_products) > 0
      and not ('none' = any(digital_products) and cardinality(digital_products) > 1)
    ),
  launches_count smallint not null check (launches_count between 0 and 10),
  partnership_experience text[] not null
    check (
      partnership_experience <@ array[
        'freelancers', 'agency', 'partnership', 'starting_now', 'worked_alone'
      ]::text[]
      and cardinality(partnership_experience) > 0
      and not (
        (('starting_now' = any(partnership_experience)) or ('worked_alone' = any(partnership_experience)))
        and partnership_experience && array['freelancers', 'agency', 'partnership']::text[]
      )
    ),
  revenue_last_12_months text not null check (revenue_last_12_months in (
    'none', 'up_to_100k', '101k_300k', '301k_600k', '601k_1m',
    '1m_3m', '3m_10m', 'above_10m'
  )),
  paid_traffic_last_12_months text not null check (paid_traffic_last_12_months in (
    'none', 'up_to_10k', '10k_50k', '50k_100k', '100k_500k', 'above_500k'
  )),
  monthly_marketing_budget numeric(14,2) not null check (monthly_marketing_budget >= 0),
  discovery_and_impressions text not null check (char_length(discovery_and_impressions) between 2 and 4000),
  launch_timeline text not null check (launch_timeline in (
    'asap', 'three_months', 'three_to_six_months', 'unknown'
  )),
  motivation text not null check (char_length(motivation) between 10 and 6000),
  partnership_authorized boolean not null check (partnership_authorized),
  lgpd_consent boolean not null check (lgpd_consent),
  consented_at timestamptz not null,
  status text not null default 'new' check (status in (
    'new', 'reviewing', 'qualified', 'disqualified', 'converted'
  )),
  internal_notes text,
  converted_project_id uuid unique references public.projects(id) on delete restrict,
  converted_by uuid references public.profiles(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expert_applications_conversion_consistency check (
    (status = 'converted' and converted_project_id is not null and converted_at is not null)
    or (status <> 'converted' and converted_project_id is null and converted_at is null)
  )
);

create index expert_applications_status_created_idx
  on public.expert_applications(status, created_at desc);
create index expert_applications_email_idx
  on public.expert_applications(lower(email));

create trigger set_updated_at_expert_applications
  before update on public.expert_applications
  for each row execute function public.handle_updated_at();

alter table public.expert_applications enable row level security;

create or replace function public.can_manage_expert_applications()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.deleted_at is null
      and (profile.role = 'admin' or profile.agency_role = 'admin')
  );
$$;

revoke all on function public.can_manage_expert_applications()
  from public, anon;
grant execute on function public.can_manage_expert_applications()
  to authenticated;

create policy expert_applications_admin_select
  on public.expert_applications
  for select
  to authenticated
  using ((select public.can_manage_expert_applications()));

create policy expert_applications_admin_update
  on public.expert_applications
  for update
  to authenticated
  using ((select public.can_manage_expert_applications()))
  with check ((select public.can_manage_expert_applications()));

revoke all on public.expert_applications from anon, authenticated;
grant select on public.expert_applications to authenticated;
grant update(status, internal_notes) on public.expert_applications to authenticated;

-- Contador interno por origem. O identificador recebido pela API ja chega
-- protegido por HMAC e nao permite reconstruir o endereco de origem.
create table public.expert_application_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table public.expert_application_rate_limits enable row level security;
revoke all on public.expert_application_rate_limits from public, anon, authenticated;
grant select, insert, update on public.expert_application_rate_limits to service_role;

create or replace function public.consume_expert_application_rate_limit(
  rate_key text,
  max_attempts integer default 5
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed boolean;
begin
  insert into public.expert_application_rate_limits(
    key_hash,
    window_started_at,
    attempts,
    updated_at
  )
  values (rate_key, now(), 1, now())
  on conflict (key_hash) do update
  set
    attempts = case
      when expert_application_rate_limits.window_started_at <= now() - interval '1 hour'
        then 1
      else expert_application_rate_limits.attempts + 1
    end,
    window_started_at = case
      when expert_application_rate_limits.window_started_at <= now() - interval '1 hour'
        then now()
      else expert_application_rate_limits.window_started_at
    end,
    updated_at = now()
  returning attempts <= greatest(max_attempts, 1) into allowed;

  return allowed;
end;
$$;

revoke all on function public.consume_expert_application_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_expert_application_rate_limit(text, integer)
  to service_role;

-- Conversao atomica: o bloqueio da candidatura impede projetos duplicados em
-- cliques concorrentes e preserva a resposta original como origem comercial.
create or replace function public.convert_expert_application_to_project(
  application_id uuid,
  project_name text,
  project_color text default '#BA7517'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_agency_id uuid;
  existing_project_id uuid;
  next_project_id uuid;
begin
  if actor_id is null or not public.can_manage_expert_applications() then
    raise exception 'Acesso negado.';
  end if;

  if char_length(trim(project_name)) < 2 or char_length(trim(project_name)) > 80 then
    raise exception 'Informe um nome de projeto entre 2 e 80 caracteres.';
  end if;

  if project_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Cor do projeto invalida.';
  end if;

  select application.converted_project_id
  into existing_project_id
  from public.expert_applications application
  where application.id = application_id
  for update;

  if not found then
    raise exception 'Candidatura nao encontrada.';
  end if;

  if existing_project_id is not null then
    return existing_project_id;
  end if;

  select coalesce(profile.agency_id, '00000000-0000-0000-0000-000000000000'::uuid)
  into actor_agency_id
  from public.profiles profile
  where profile.id = actor_id
    and profile.deleted_at is null;

  insert into public.projects(user_id, agency_id, name, color)
  values (actor_id, actor_agency_id, trim(project_name), upper(project_color))
  returning id into next_project_id;

  update public.expert_applications
  set
    status = 'converted',
    converted_project_id = next_project_id,
    converted_by = actor_id,
    converted_at = now()
  where id = application_id;

  return next_project_id;
end;
$$;

revoke all on function public.convert_expert_application_to_project(uuid, text, text)
  from public, anon;
grant execute on function public.convert_expert_application_to_project(uuid, text, text)
  to authenticated;

comment on table public.expert_applications is
  'Candidaturas publicas de potenciais experts, independentes de projetos ate a conversao administrativa.';
comment on column public.expert_applications.converted_project_id is
  'Projeto criado a partir desta candidatura; preenchido apenas pela conversao atomica.';
