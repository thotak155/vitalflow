-- =============================================================================
-- 0004 — Clinical orders, notes, prescriptions, attachments, signatures
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.order_type as enum ('lab','imaging','medication','referral','procedure','nursing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('draft','ordered','in_progress','completed','cancelled','amended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_priority as enum ('routine','urgent','stat','asap');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_result_status as enum ('preliminary','final','amended','cancelled','corrected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.prescription_status as enum ('draft','sent','filled','cancelled','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.note_type as enum ('soap','progress','discharge','consult','operative','procedure','nursing','ai_draft');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.note_status as enum ('draft','pending_review','signed','amended');
exception when duplicate_object then null; end $$;

-- ---------- Orders -----------------------------------------------------------

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  patient_id      uuid not null references public.patients(id) on delete restrict,
  encounter_id    uuid references public.encounters(id) on delete set null,
  ordering_provider_id uuid not null references auth.users(id),
  type            public.order_type not null,
  status          public.order_status not null default 'draft',
  priority        public.order_priority not null default 'routine',
  code_system     text,                -- LOINC (lab), SNOMED (procedure), CPT, etc.
  code            text,
  display_name    text not null,
  reason          text,
  instructions    text,
  scheduled_for   timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  cancelled_reason text
);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index if not exists orders_tenant_status_idx
  on public.orders (tenant_id, status);
create index if not exists orders_patient_created_idx
  on public.orders (patient_id, created_at desc);
create index if not exists orders_encounter_idx on public.orders (encounter_id);
create index if not exists orders_provider_created_idx
  on public.orders (ordering_provider_id, created_at desc);

alter table public.orders enable row level security;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  );

drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function audit.log_change();

-- ---------- Order results ----------------------------------------------------

create table if not exists public.order_results (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  order_id       uuid not null references public.orders(id) on delete cascade,
  status         public.order_result_status not null default 'preliminary',
  observed_at    timestamptz not null default now(),
  reported_at    timestamptz,
  reported_by    uuid references auth.users(id),
  code_system    text,
  code           text,
  display_name   text not null,
  value_numeric  numeric(14,4),
  value_text     text,
  value_json     jsonb,
  unit           text,
  reference_low  numeric(14,4),
  reference_high numeric(14,4),
  abnormal_flag  text check (abnormal_flag in ('L','H','LL','HH','A','AA','N') or abnormal_flag is null),
  interpretation text,
  attachments    uuid[] default '{}'::uuid[],
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists order_results_set_updated_at on public.order_results;
create trigger order_results_set_updated_at
  before update on public.order_results
  for each row execute function public.set_updated_at();

create index if not exists order_results_order_idx
  on public.order_results (order_id, observed_at desc);
create index if not exists order_results_tenant_status_idx
  on public.order_results (tenant_id, status);

alter table public.order_results enable row level security;

drop policy if exists order_results_rls on public.order_results;
create policy order_results_rls on public.order_results
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists order_results_audit on public.order_results;
create trigger order_results_audit
  after insert or update or delete on public.order_results
  for each row execute function audit.log_change();

-- ---------- Prescriptions ----------------------------------------------------

create table if not exists public.prescriptions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete restrict,
  patient_id       uuid not null references public.patients(id) on delete restrict,
  order_id         uuid references public.orders(id) on delete set null,
  medication_id    uuid references public.medications(id) on delete set null,
  prescribing_provider_id uuid not null references auth.users(id),
  rxnorm_code      text,
  display_name     text not null,
  dose             text not null,
  route            text,
  frequency        text,
  quantity         numeric(10,2),
  quantity_unit    text,
  days_supply      smallint,
  refills          smallint not null default 0 check (refills >= 0),
  refills_remaining smallint not null default 0,
  pharmacy_ncpdp   text,
  pharmacy_name    text,
  status           public.prescription_status not null default 'draft',
  sent_at          timestamptz,
  filled_at        timestamptz,
  expires_at       timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists prescriptions_set_updated_at on public.prescriptions;
create trigger prescriptions_set_updated_at
  before update on public.prescriptions
  for each row execute function public.set_updated_at();

create index if not exists prescriptions_patient_created_idx
  on public.prescriptions (patient_id, created_at desc);
create index if not exists prescriptions_tenant_status_idx
  on public.prescriptions (tenant_id, status);

alter table public.prescriptions enable row level security;

drop policy if exists prescriptions_rls on public.prescriptions;
create policy prescriptions_rls on public.prescriptions
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists prescriptions_audit on public.prescriptions;
create trigger prescriptions_audit
  after insert or update or delete on public.prescriptions
  for each row execute function audit.log_change();

-- ---------- Encounter notes --------------------------------------------------

create table if not exists public.encounter_notes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  encounter_id   uuid not null references public.encounters(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete restrict,
  author_id      uuid not null references auth.users(id),
  type           public.note_type not null default 'soap',
  status         public.note_status not null default 'draft',
  subjective     text,
  objective      text,
  assessment     text,
  plan           text,
  free_text      text,       -- for non-SOAP note types
  ai_assisted    boolean not null default false,
  ai_request_id  uuid,       -- FK added in 0008 to avoid circular dep
  signed_by      uuid references auth.users(id),
  signed_at      timestamptz,
  amended_from   uuid references public.encounter_notes(id),
  version        smallint not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists encounter_notes_set_updated_at on public.encounter_notes;
create trigger encounter_notes_set_updated_at
  before update on public.encounter_notes
  for each row execute function public.set_updated_at();

create index if not exists encounter_notes_encounter_idx
  on public.encounter_notes (encounter_id, created_at desc);
create index if not exists encounter_notes_patient_idx
  on public.encounter_notes (patient_id, created_at desc);
create index if not exists encounter_notes_tenant_status_idx
  on public.encounter_notes (tenant_id, status);

alter table public.encounter_notes enable row level security;

drop policy if exists encounter_notes_select on public.encounter_notes;
create policy encounter_notes_select on public.encounter_notes
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  );

drop policy if exists encounter_notes_write on public.encounter_notes;
create policy encounter_notes_write on public.encounter_notes
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists encounter_notes_audit on public.encounter_notes;
create trigger encounter_notes_audit
  after insert or update or delete on public.encounter_notes
  for each row execute function audit.log_change();

-- ---------- Attachments (Storage pointers) -----------------------------------

create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  patient_id    uuid references public.patients(id) on delete set null,
  encounter_id  uuid references public.encounters(id) on delete set null,
  uploaded_by   uuid references auth.users(id),
  storage_bucket text not null,
  storage_path  text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  sha256        text,
  label         text,
  category      text,     -- 'consent','referral','imaging','lab_report','id','insurance_card'
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (storage_bucket, storage_path)
);

create index if not exists attachments_patient_idx on public.attachments (patient_id);
create index if not exists attachments_encounter_idx on public.attachments (encounter_id);
create index if not exists attachments_tenant_created_idx
  on public.attachments (tenant_id, created_at desc) where deleted_at is null;

alter table public.attachments enable row level security;

drop policy if exists attachments_rls on public.attachments;
create policy attachments_rls on public.attachments
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists attachments_audit on public.attachments;
create trigger attachments_audit
  after insert or update or delete on public.attachments
  for each row execute function audit.log_change();

-- ---------- Signatures -------------------------------------------------------

create table if not exists public.signatures (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  signer_id    uuid not null references auth.users(id),
  subject_schema text not null,         -- e.g. 'public'
  subject_table  text not null,         -- e.g. 'encounter_notes'
  subject_id   uuid not null,
  attestation  text,                    -- free-text statement signed to
  signed_at    timestamptz not null default now(),
  ip           inet,
  user_agent   text,
  hash         text not null,           -- sha256 of subject payload at sign time
  created_at   timestamptz not null default now()
);

create index if not exists signatures_subject_idx
  on public.signatures (subject_schema, subject_table, subject_id);
create index if not exists signatures_tenant_signer_idx
  on public.signatures (tenant_id, signer_id, signed_at desc);

alter table public.signatures enable row level security;

drop policy if exists signatures_select on public.signatures;
create policy signatures_select on public.signatures
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

-- Signatures are inserted by the clinician themselves and are immutable thereafter.
drop policy if exists signatures_insert on public.signatures;
create policy signatures_insert on public.signatures
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and signer_id = auth.uid()
    and public.has_permission('clinical:sign', tenant_id)
  );

-- No update/delete policies → denied for end users (service_role bypasses RLS).
revoke update, delete on public.signatures from authenticated, anon;

drop trigger if exists signatures_audit on public.signatures;
create trigger signatures_audit
  after insert or update or delete on public.signatures
  for each row execute function audit.log_change();
