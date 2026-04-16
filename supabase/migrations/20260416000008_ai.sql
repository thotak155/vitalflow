-- =============================================================================
-- 0008 — AI: requests, completions, embeddings (pgvector), feedback
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.ai_provider as enum ('anthropic','openai');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_request_status as enum ('pending','streaming','completed','failed','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_safety_verdict as enum ('pass','warn','block');
exception when duplicate_object then null; end $$;

-- ---------- AI requests ------------------------------------------------------

create table if not exists public.ai_requests (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete restrict,
  user_id            uuid not null references auth.users(id),
  surface            text not null,              -- e.g. 'encounter-note-draft', 'triage-helper'
  provider           public.ai_provider not null,
  model              text not null,
  status             public.ai_request_status not null default 'pending',
  prompt_hash        text not null,              -- sha256 of redacted prompt (dedupe / cache key)
  prompt_tokens      integer,
  redacted_context   jsonb,                      -- redacted view of inputs (no PHI)
  safety_verdict     public.ai_safety_verdict not null default 'pass',
  safety_reason      text,
  correlation_id     text,                        -- request_id propagated from app
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  error_message      text,
  cost_micros_usd    integer,                    -- cost in USD micro-units (1e-6 USD)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists ai_requests_set_updated_at on public.ai_requests;
create trigger ai_requests_set_updated_at
  before update on public.ai_requests
  for each row execute function public.set_updated_at();

create index if not exists ai_requests_tenant_started_idx
  on public.ai_requests (tenant_id, started_at desc);
create index if not exists ai_requests_user_started_idx
  on public.ai_requests (user_id, started_at desc);
create index if not exists ai_requests_status_idx
  on public.ai_requests (tenant_id, status);

alter table public.ai_requests enable row level security;

drop policy if exists ai_requests_select on public.ai_requests;
create policy ai_requests_select on public.ai_requests
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (user_id = auth.uid() or public.has_permission('admin:tenant', tenant_id))
  );

drop policy if exists ai_requests_insert on public.ai_requests;
create policy ai_requests_insert on public.ai_requests
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and user_id = auth.uid()
    and public.has_permission('ai:invoke', tenant_id)
  );

-- AI requests are immutable from the client. Updates to mark completed happen
-- via service_role (which bypasses RLS).
revoke update, delete on public.ai_requests from authenticated, anon;

-- ---------- AI completions ---------------------------------------------------

create table if not exists public.ai_completions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete restrict,
  request_id        uuid not null references public.ai_requests(id) on delete cascade,
  content           text not null,
  completion_tokens integer,
  total_tokens      integer,
  finish_reason     text,      -- 'stop','length','content_filter','tool_use'
  latency_ms        integer,
  created_at        timestamptz not null default now()
);

create index if not exists ai_completions_request_idx on public.ai_completions (request_id);
create index if not exists ai_completions_tenant_created_idx
  on public.ai_completions (tenant_id, created_at desc);

alter table public.ai_completions enable row level security;

drop policy if exists ai_completions_select on public.ai_completions;
create policy ai_completions_select on public.ai_completions
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (
      request_id in (select id from public.ai_requests where user_id = auth.uid())
      or public.has_permission('admin:tenant', tenant_id)
    )
  );

revoke update, delete on public.ai_completions from authenticated, anon;

-- ---------- AI embeddings (pgvector) ----------------------------------------

create table if not exists public.ai_embeddings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  source_schema  text not null,
  source_table   text not null,
  source_id      uuid not null,
  chunk_index    integer not null default 0,
  content        text not null,
  embedding      vector(1536) not null,
  model          text not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (tenant_id, source_schema, source_table, source_id, chunk_index)
);

-- HNSW index — pgvector's recommended default for production. Limit of 2000
-- dimensions is the reason we use 1536 here (matches OpenAI text-embedding-3-
-- small and Voyage v3). For 3072-dim embeddings, either drop the index or
-- use Supabase's matryoshka dimension truncation to 1536.
create index if not exists ai_embeddings_embedding_hnsw_idx
  on public.ai_embeddings using hnsw (embedding vector_cosine_ops);

create index if not exists ai_embeddings_source_idx
  on public.ai_embeddings (tenant_id, source_schema, source_table, source_id);

alter table public.ai_embeddings enable row level security;

drop policy if exists ai_embeddings_rls on public.ai_embeddings;
create policy ai_embeddings_rls on public.ai_embeddings
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- ---------- AI feedback ------------------------------------------------------

create table if not exists public.ai_feedback (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  request_id    uuid not null references public.ai_requests(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  rating        smallint not null check (rating between -1 and 1),
  comment       text,
  correction    text,
  created_at    timestamptz not null default now()
);

create index if not exists ai_feedback_request_idx on public.ai_feedback (request_id);
create index if not exists ai_feedback_tenant_created_idx
  on public.ai_feedback (tenant_id, created_at desc);

alter table public.ai_feedback enable row level security;

drop policy if exists ai_feedback_select on public.ai_feedback;
create policy ai_feedback_select on public.ai_feedback
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists ai_feedback_insert on public.ai_feedback;
create policy ai_feedback_insert on public.ai_feedback
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and user_id = auth.uid()
  );

-- ---------- Circular FK back from encounter_notes ---------------------------

alter table public.encounter_notes
  drop constraint if exists encounter_notes_ai_request_fkey;
alter table public.encounter_notes
  add constraint encounter_notes_ai_request_fkey
  foreign key (ai_request_id) references public.ai_requests(id)
  on delete set null;
