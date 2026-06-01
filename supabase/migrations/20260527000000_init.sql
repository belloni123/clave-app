-- ════════════════════════════════════════════════
-- CLAVE DATABASE SCHEMA & RLS POLICIES
-- ════════════════════════════════════════════════

-- Habilitar a extensão UUID se não estiver habilitada
create extension if not exists "uuid-ossp";

-- 1. TRIGGER PARA ATUALIZAR A COLUNA updated_at AUTOMATICAMENTE
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. TABELA DE PERFIS DE USUÁRIOS
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('admin', 'client', 'colab', 'student')),
  plan text not null default 'free',
  max_projects integer default 2,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

alter table public.profiles enable row level security;

-- Triggers de auditoria
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Políticas RLS para perfis
create policy "Usuários podem ver seu próprio perfil ou administradores todos"
  on public.profiles for select
  using (auth.uid() = id or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

create policy "Usuários podem atualizar seu próprio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Apenas administradores criam ou deletam perfis"
  on public.profiles for all
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

-- 3. TABELA DE PROJETOS (Tenant/Workspace)
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  color text not null default '#534AB7',
  level text not null default 'newbie' check (level in ('newbie', 'soft', 'hard', 'pro', 'master')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

alter table public.projects enable row level security;

create trigger set_updated_at_projects
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- 4. ASSOCIAÇÃO DE COLABORADORES COM PROJETOS
create table public.colab_assignments (
  colab_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (colab_id, project_id)
);

alter table public.colab_assignments enable row level security;

-- Políticas RLS para projetos
create policy "Projetos visíveis para donos, colaboradores ou admins"
  on public.projects for select
  using (
    user_id = auth.uid() 
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
    or id in (
      select project_id from public.colab_assignments where colab_id = auth.uid()
    )
  );

create policy "Donos de projetos ou admins podem gerenciar projetos"
  on public.projects for all
  using (
    user_id = auth.uid() 
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Políticas RLS para colab_assignments
create policy "Atribuições visíveis para o dono do projeto, o colaborador e admins"
  on public.colab_assignments for select
  using (
    colab_id = auth.uid()
    or exists (
      select 1 from public.projects where id = project_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Dono do projeto ou admin podem gerenciar atribuições"
  on public.colab_assignments for all
  using (
    exists (
      select 1 from public.projects where id = project_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- 5. HELPER FUNCTION PARA VALIDAR SE O USUÁRIO TEM ACESSO AO PROJETO
create or replace function public.user_has_project_access(proj_id uuid, usr_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.projects 
    where id = proj_id and user_id = usr_id
  ) or exists (
    select 1 from public.colab_assignments 
    where project_id = proj_id and colab_id = usr_id
  ) or exists (
    select 1 from public.profiles 
    where id = usr_id and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 6. TABELAS DE MÓDULOS DE PROJETO (Isolamento por RLS acoplado ao project_id)

-- 6.1. Matriz do Perpétuo
create table public.matrix_answers (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  answers jsonb not null, -- Array de 19 booleanos/nulos [v, f, null, ...]
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.matrix_answers enable row level security;
create trigger set_updated_at_matrix
  before update on public.matrix_answers
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para matriz"
  on public.matrix_answers for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.2. Cenários de Precificação
create table public.pricing_scenarios (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  data jsonb not null, -- Informações formulaicas do cenário
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.pricing_scenarios enable row level security;
create trigger set_updated_at_pricing
  before update on public.pricing_scenarios
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para precificação"
  on public.pricing_scenarios for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.3. Anúncios (Campanhas/Kanban)
create table public.ads (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  platform text not null,
  status text not null check (status in ('rascunho', 'ativo', 'pausado', 'encerrado')),
  invested numeric(12,2) default 0,
  revenue numeric(12,2) default 0,
  leads integer default 0,
  sales integer default 0,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);
alter table public.ads enable row level security;
create trigger set_updated_at_ads
  before update on public.ads
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para anúncios"
  on public.ads for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.4. Banco de Histórias
create table public.stories (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  title text not null,
  category text not null,
  emotion text not null,
  context text,
  result text,
  body text not null,
  used boolean default false not null,
  ai_analysis jsonb, -- Resumo, ângulos, formatos, gatilhos sugeridos por IA
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);
alter table public.stories enable row level security;
create trigger set_updated_at_stories
  before update on public.stories
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para histórias"
  on public.stories for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.5. Calendário/Planejador
create table public.calendar_events (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  title text not null,
  date date not null,
  type text not null check (type in ('Lançamento', 'Conteúdo', 'Anúncio', 'Reunião', 'Outro')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);
alter table public.calendar_events enable row level security;
create trigger set_updated_at_calendar
  before update on public.calendar_events
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para calendário"
  on public.calendar_events for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.6. Checklists de Lançamento
create table public.launch_checklists (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  type text not null check (type in ('val', 'ep', 'pv')), -- Validação, Evento Pago, Pico de Vendas
  state jsonb not null, -- Estado dos checkboxes {'Grupo_0': true, ...}
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.launch_checklists enable row level security;
create trigger set_updated_at_launch_checklists
  before update on public.launch_checklists
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para checklists de lançamento"
  on public.launch_checklists for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.7. Dados Financeiros
create table public.financial_data (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  briefing jsonb not null,
  params jsonb not null,
  offers jsonb not null,
  investments jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.financial_data enable row level security;
create trigger set_updated_at_financial
  before update on public.financial_data
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para financeiro"
  on public.financial_data for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 6.8. Campos de Texto Gerais
create table public.text_fields (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  key text not null, -- ex: 'id-met', 'id-qd', 'vsl-copy'
  value text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_project_key unique (project_id, key)
);
alter table public.text_fields enable row level security;
create trigger set_updated_at_text_fields
  before update on public.text_fields
  for each row execute function public.handle_updated_at();

create policy "Acesso ao projeto para campos de texto"
  on public.text_fields for all
  using (public.user_has_project_access(project_id, auth.uid()));

-- 7. TABELAS DE HIERARQUIA DE ACESSO (Networking, Clientes e Alunos)

-- 7.1. Clientes
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null, -- Dono do perfil do cliente
  name text not null,
  company text not null,
  niche text,
  status text not null default 'ativo',
  networking_enabled boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);
alter table public.clients enable row level security;
create trigger set_updated_at_clients
  before update on public.clients
  for each row execute function public.handle_updated_at();

create policy "Clientes visíveis para donos, admins ou com networking habilitado"
  on public.clients for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
    or (networking_enabled = true and exists (
      select 1 from public.profiles where id = auth.uid() and role in ('client', 'colab')
    ))
  );

create policy "Clientes editáveis pelos donos ou admins"
  on public.clients for all
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- 7.2. Alunos
create table public.students (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  niche text,
  skills text[] default '{}'::text[] not null,
  cohort text, -- Turma/Grupo da mentoria
  talent_pool boolean default false not null, -- Se deseja aparecer no banco de talentos
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);
alter table public.students enable row level security;
create trigger set_updated_at_students
  before update on public.students
  for each row execute function public.handle_updated_at();

create policy "Alunos visíveis para donos, admins ou na talent_pool"
  on public.students for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
    or (talent_pool = true and exists (
      select 1 from public.profiles where id = auth.uid() and role in ('client', 'colab', 'student')
    ))
  );

create policy "Alunos editáveis pelos donos ou admins"
  on public.students for all
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- 8. INDEXAÇÃO PARA OTIMIZAÇÃO DE PERFORMANCE (Foreign Keys e Filtros Frequentes)
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_matrix_project_id on public.matrix_answers(project_id);
create index if not exists idx_pricing_project_id on public.pricing_scenarios(project_id);
create index if not exists idx_ads_project_id on public.ads(project_id);
create index if not exists idx_stories_project_id on public.stories(project_id);
create index if not exists idx_calendar_project_id on public.calendar_events(project_id);
create index if not exists idx_launch_project_id on public.launch_checklists(project_id);
create index if not exists idx_financial_project_id on public.financial_data(project_id);
create index if not exists idx_text_fields_project_id on public.text_fields(project_id);
create index if not exists idx_clients_owner_id on public.clients(owner_id);
create index if not exists idx_students_owner_id on public.students(owner_id);
create index if not exists idx_colab_assignments_colab_id on public.colab_assignments(colab_id);
create index if not exists idx_colab_assignments_project_id on public.colab_assignments(project_id);
