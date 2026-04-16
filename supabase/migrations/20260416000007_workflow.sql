-- =============================================================================
-- 0007 — Workflow: definitions, runs, tasks, comments
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.workflow_run_status as enum (
    'pending','running','paused','completed','failed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum (
    'pending','assigned','in_progress','blocked','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

-- ---------- Workflow definitions --------------------------------------------

create table if not exists public.workflow_definitions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete cascade,  -- null = system template
  key          text not null,        -- e.g. 'encounter-lifecycle'
  version      smallint not null default 1,
  display_name text not null,
  description  text,
  definition   jsonb not null,       -- serialized xstate machine
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, key, version)
);

drop trigger if exists workflow_definitions_set_updated_at on public.workflow_definitions;
create trigger workflow_definitions_set_updated_at
  before update on public.workflow_definitions
  for each row execute function public.set_updated_at();

create index if not exists workflow_definitions_tenant_key_idx
  on public.workflow_definitions (tenant_id, key, version desc);

alter table public.workflow_definitions enable row level security;

drop policy if exists workflow_definitions_select on public.workflow_definitions;
create policy workflow_definitions_select on public.workflow_definitions
  for select to authenticated
  using (tenant_id is null or tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists workflow_definitions_write on public.workflow_definitions;
create policy workflow_definitions_write on public.workflow_definitions
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  );

-- ---------- Workflow runs ----------------------------------------------------

create table if not exists public.workflow_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete restrict,
  definition_id    uuid not null references public.workflow_definitions(id),
  correlation_id   text,                  -- external id (encounter_id, claim_id, etc.)
  status           public.workflow_run_status not null default 'pending',
  current_state    text,
  context          jsonb not null default '{}'::jsonb,
  started_at       timestamptz,
  completed_at     timestamptz,
  last_error       text,
  started_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists workflow_runs_set_updated_at on public.workflow_runs;
create trigger workflow_runs_set_updated_at
  before update on public.workflow_runs
  for each row execute function public.set_updated_at();

create index if not exists workflow_runs_tenant_status_idx
  on public.workflow_runs (tenant_id, status);
create index if not exists workflow_runs_correlation_idx
  on public.workflow_runs (tenant_id, correlation_id);
create index if not exists workflow_runs_definition_idx
  on public.workflow_runs (definition_id, started_at desc);

alter table public.workflow_runs enable row level security;

drop policy if exists workflow_runs_rls on public.workflow_runs;
create policy workflow_runs_rls on public.workflow_runs
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

drop trigger if exists workflow_runs_audit on public.workflow_runs;
create trigger workflow_runs_audit
  after insert or update or delete on public.workflow_runs
  for each row execute function audit.log_change();

-- ---------- Tasks ------------------------------------------------------------

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  parent_task_id  uuid references public.tasks(id) on delete set null,
  subject_schema  text,
  subject_table   text,
  subject_id      uuid,
  title           text not null check (char_length(title) between 1 and 256),
  description     text,
  status          public.task_status not null default 'pending',
  priority        public.task_priority not null default 'normal',
  assignee_id     uuid references auth.users(id),
  assigned_at     timestamptz,
  due_at          timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  tags            text[] not null default '{}'::text[],
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create index if not exists tasks_tenant_status_idx
  on public.tasks (tenant_id, status, priority desc, due_at nulls last);
create index if not exists tasks_assignee_status_idx
  on public.tasks (assignee_id, status)
  where status in ('pending','assigned','in_progress');
create index if not exists tasks_subject_idx
  on public.tasks (subject_schema, subject_table, subject_id);
create index if not exists tasks_run_idx on public.tasks (workflow_run_id);
create index if not exists tasks_due_idx on public.tasks (tenant_id, due_at)
  where status in ('pending','assigned','in_progress') and due_at is not null;
create index if not exists tasks_tags_idx on public.tasks using gin (tags);

alter table public.tasks enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

drop trigger if exists tasks_audit on public.tasks;
create trigger tasks_audit
  after insert or update or delete on public.tasks
  for each row execute function audit.log_change();

-- ---------- Task comments ----------------------------------------------------

create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete restrict,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid not null references auth.users(id),
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

drop trigger if exists task_comments_set_updated_at on public.task_comments;
create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_updated_at();

create index if not exists task_comments_task_created_idx
  on public.task_comments (task_id, created_at)
  where deleted_at is null;

alter table public.task_comments enable row level security;

drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and author_id = auth.uid()
  );

drop policy if exists task_comments_update on public.task_comments;
create policy task_comments_update on public.task_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
