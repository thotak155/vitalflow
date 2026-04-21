-- =============================================================================
-- 0017 — AI scribe tables + google provider enum
-- =============================================================================
-- Introduces the three tables the AI Scribe workflow needs:
--   1. ai_scribe_sessions — orchestration object linking transcript + draft +
--      code suggestions to an encounter.
--   2. ai_scribe_transcript_segments — chunked transcript with optional
--      timestamps; trace references in AI output point here.
--   3. ai_scribe_code_suggestions — per-code ICD-10 / CPT suggestions with
--      confidence + segment provenance.
--
-- Also extends `public.ai_provider` with a `google` value so Gemini Flash can
-- power transcription and code suggestion.
--
-- See docs/ai-scribe.md for the full design.
-- =============================================================================

alter type public.ai_provider add value if not exists 'google';

do $$ begin
  create type public.ai_scribe_session_status as enum (
    'pending', 'transcribing', 'generating', 'suggesting_codes',
    'awaiting_review', 'accepted', 'rejected', 'cancelled', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_scribe_source as enum ('audio_upload', 'transcript_paste', 'stream');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_code_type as enum ('diagnosis', 'procedure');
exception when duplicate_object then null; end $$;

-- ---- ai_scribe_sessions ----------------------------------------------------

create table if not exists public.ai_scribe_sessions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  encounter_id     uuid not null references public.encounters(id) on delete cascade,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  created_by       uuid not null references auth.users(id),
  source           public.ai_scribe_source not null,
  status           public.ai_scribe_session_status not null default 'pending',
  transcribe_request_id uuid references public.ai_requests(id) on delete set null,
  generate_request_id   uuid references public.ai_requests(id) on delete set null,
  suggest_request_id    uuid references public.ai_requests(id) on delete set null,
  accepted_note_id      uuid references public.encounter_notes(id) on delete set null,
  audio_storage_path    text,
  total_cost_micros_usd integer,
  total_latency_ms      integer,
  error_message         text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ai_scribe_sessions_tenant_enc_idx
  on public.ai_scribe_sessions (tenant_id, encounter_id)
  where status not in ('cancelled', 'rejected');

create index if not exists ai_scribe_sessions_status_idx
  on public.ai_scribe_sessions (tenant_id, status);

drop trigger if exists ai_scribe_sessions_set_updated_at on public.ai_scribe_sessions;
create trigger ai_scribe_sessions_set_updated_at
  before update on public.ai_scribe_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists ai_scribe_sessions_audit on public.ai_scribe_sessions;
create trigger ai_scribe_sessions_audit
  after insert or update or delete on public.ai_scribe_sessions
  for each row execute function audit.log_change();

alter table public.ai_scribe_sessions enable row level security;

drop policy if exists ai_scribe_sessions_select on public.ai_scribe_sessions;
create policy ai_scribe_sessions_select on public.ai_scribe_sessions
  for select using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

drop policy if exists ai_scribe_sessions_insert on public.ai_scribe_sessions;
create policy ai_scribe_sessions_insert on public.ai_scribe_sessions
  for insert with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

drop policy if exists ai_scribe_sessions_update on public.ai_scribe_sessions;
create policy ai_scribe_sessions_update on public.ai_scribe_sessions
  for update using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  ) with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

-- ---- ai_scribe_transcript_segments ------------------------------------------

create table if not exists public.ai_scribe_transcript_segments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  session_id       uuid not null references public.ai_scribe_sessions(id) on delete cascade,
  sequence_index   smallint not null,
  start_ms         integer,
  end_ms           integer,
  speaker          text,
  text             text not null,
  partial          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint ai_scribe_transcript_segments_seq_unique unique (session_id, sequence_index)
);

create index if not exists ai_scribe_transcript_segments_session_idx
  on public.ai_scribe_transcript_segments (session_id, sequence_index);

drop trigger if exists ai_scribe_transcript_segments_audit
  on public.ai_scribe_transcript_segments;
create trigger ai_scribe_transcript_segments_audit
  after insert or update or delete on public.ai_scribe_transcript_segments
  for each row execute function audit.log_change();

alter table public.ai_scribe_transcript_segments enable row level security;

drop policy if exists ai_scribe_transcript_segments_select
  on public.ai_scribe_transcript_segments;
create policy ai_scribe_transcript_segments_select on public.ai_scribe_transcript_segments
  for select using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

drop policy if exists ai_scribe_transcript_segments_write
  on public.ai_scribe_transcript_segments;
create policy ai_scribe_transcript_segments_write on public.ai_scribe_transcript_segments
  for insert with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

-- ---- ai_scribe_code_suggestions ---------------------------------------------

create table if not exists public.ai_scribe_code_suggestions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  session_id       uuid not null references public.ai_scribe_sessions(id) on delete cascade,
  encounter_id     uuid not null references public.encounters(id) on delete cascade,
  type             public.ai_code_type not null,
  code_system      text not null,
  code             text not null,
  description      text not null,
  confidence       numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  rank             smallint not null,
  segment_ids      uuid[] not null default '{}',
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users(id),
  rejected_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists ai_scribe_code_suggestions_session_idx
  on public.ai_scribe_code_suggestions (session_id, type, rank);

drop trigger if exists ai_scribe_code_suggestions_audit
  on public.ai_scribe_code_suggestions;
create trigger ai_scribe_code_suggestions_audit
  after insert or update or delete on public.ai_scribe_code_suggestions
  for each row execute function audit.log_change();

alter table public.ai_scribe_code_suggestions enable row level security;

drop policy if exists ai_scribe_code_suggestions_select
  on public.ai_scribe_code_suggestions;
create policy ai_scribe_code_suggestions_select on public.ai_scribe_code_suggestions
  for select using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

drop policy if exists ai_scribe_code_suggestions_write
  on public.ai_scribe_code_suggestions;
create policy ai_scribe_code_suggestions_write on public.ai_scribe_code_suggestions
  for all using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  ) with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('ai:invoke', tenant_id)
  );

comment on table public.ai_scribe_sessions is
  'AI scribe orchestration session — ties a transcript + draft + code suggestions to an encounter. See docs/ai-scribe.md.';
comment on table public.ai_scribe_transcript_segments is
  'Chunked transcript for trace references back from AI output sections.';
comment on table public.ai_scribe_code_suggestions is
  'AI-suggested ICD-10 / CPT codes with confidence + transcript provenance.';
