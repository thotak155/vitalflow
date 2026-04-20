-- =============================================================================
-- 0016 — Clinical domain V1 extensions
-- =============================================================================
-- Three changes that unblock the insurance / diagnosis / document UI slices
-- defined in docs/clinical-domain.md:
--
--   1. clinical_notes_current  (view) — one-current-per-encounter handle over
--      the amended_from chain in public.encounter_notes.
--   2. diagnosis_assignments   (table) — encounter-scoped ICD-10 mapping.
--      Distinct from public.problems which is the patient-level problem list.
--   3. attachments             (alter) — ClinicalDocument fields: kind,
--      source, signed_by, signed_at, effective_date.
--
-- No data-migration required; all additions are additive.
-- =============================================================================

-- ---- 1. clinical_notes_current view ----------------------------------------

create or replace view public.clinical_notes_current
with (security_invoker = on) as
select distinct on (encounter_id) *
from public.encounter_notes
where status <> 'amended'
order by encounter_id, version desc;

comment on view public.clinical_notes_current is
  'One row per encounter — the current (non-amended) clinical note. Uses
   security_invoker so RLS from encounter_notes applies to the view caller.';

-- ---- 2. diagnosis_assignments table ----------------------------------------

create table if not exists public.diagnosis_assignments (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  patient_id           uuid not null references public.patients(id) on delete cascade,
  encounter_id         uuid not null references public.encounters(id) on delete cascade,
  problem_id           uuid references public.problems(id) on delete set null,
  code_system          text not null default 'icd10-cm',
  code                 text not null,
  description          text not null,
  rank                 smallint not null check (rank between 1 and 12),
  pointer              text check (pointer ~ '^[A-L]$'),
  present_on_admission text check (present_on_admission in ('Y','N','U','W')),
  assigned_by          uuid not null references auth.users(id),
  assigned_at          timestamptz not null default now(),
  removed_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists diagnosis_assignments_tenant_enc_idx
  on public.diagnosis_assignments (tenant_id, encounter_id)
  where removed_at is null;

create index if not exists diagnosis_assignments_tenant_patient_idx
  on public.diagnosis_assignments (tenant_id, patient_id)
  where removed_at is null;

-- Exactly one active assignment per (encounter, rank).
create unique index if not exists diagnosis_assignments_rank_unique_active
  on public.diagnosis_assignments (encounter_id, rank)
  where removed_at is null;

-- Updated_at trigger (uses the existing set_updated_at helper from migration 0001).
drop trigger if exists diagnosis_assignments_set_updated_at
  on public.diagnosis_assignments;
create trigger diagnosis_assignments_set_updated_at
  before update on public.diagnosis_assignments
  for each row execute function public.set_updated_at();

-- Audit trigger — row-level before/after diffs into audit.audit_events.
drop trigger if exists diagnosis_assignments_audit
  on public.diagnosis_assignments;
create trigger diagnosis_assignments_audit
  after insert or update or delete on public.diagnosis_assignments
  for each row execute function audit.log_change();

-- RLS — tenant isolation + permission gate.
alter table public.diagnosis_assignments enable row level security;

drop policy if exists diagnosis_assignments_select on public.diagnosis_assignments;
create policy diagnosis_assignments_select on public.diagnosis_assignments
  for select
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  );

drop policy if exists diagnosis_assignments_insert on public.diagnosis_assignments;
create policy diagnosis_assignments_insert on public.diagnosis_assignments
  for insert
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop policy if exists diagnosis_assignments_update on public.diagnosis_assignments;
create policy diagnosis_assignments_update on public.diagnosis_assignments
  for update
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop policy if exists diagnosis_assignments_delete on public.diagnosis_assignments;
create policy diagnosis_assignments_delete on public.diagnosis_assignments
  for delete
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

comment on table public.diagnosis_assignments is
  'Encounter-scoped ICD-10 (or SNOMED) diagnosis assignments used for claim
   generation and note finalization. Distinct from public.problems which holds
   the patient-level running problem list. See docs/clinical-domain.md §2.7.';

-- ---- 3. attachments extension for ClinicalDocument -------------------------

alter table public.attachments
  add column if not exists kind             text default 'other',
  add column if not exists source           text default 'upload',
  add column if not exists signed_by        uuid references auth.users(id),
  add column if not exists signed_at        timestamptz,
  add column if not exists effective_date   date;

-- Optional CHECK constraints — soft guidance for now; strict enforcement once
-- the attachment uploader UI is in.
alter table public.attachments
  drop constraint if exists attachments_kind_check;
alter table public.attachments
  add constraint attachments_kind_check
  check (kind in (
    'note_pdf','lab_report','imaging_report','discharge_summary',
    'intake_form','consent','identification','insurance_card','other'
  ));

alter table public.attachments
  drop constraint if exists attachments_source_check;
alter table public.attachments
  add constraint attachments_source_check
  check (source in ('upload','generated','ehr_import','fax'));

comment on column public.attachments.kind is
  'Structured document kind. note_pdf/consent/etc. require signed_by set.
   See docs/clinical-domain.md §2.8.';
