-- =============================================================================
-- 0003 — Clinical core
-- =============================================================================
-- Patients, encounters, vitals, allergies, problems, medications, immunizations.
-- All tables are tenant-scoped and audited.
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.sex_at_birth as enum ('male','female','intersex','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.encounter_status as enum ('planned','arrived','in_progress','finished','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.encounter_class as enum ('ambulatory','emergency','inpatient','telehealth','home','virtual','observation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contact_type as enum ('phone_home','phone_mobile','phone_work','email','address');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.allergy_type as enum ('medication','food','environmental','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.allergy_severity as enum ('mild','moderate','severe','life_threatening');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.problem_status as enum ('active','inactive','resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.medication_status as enum ('active','on_hold','completed','stopped','draft');
exception when duplicate_object then null; end $$;

-- ---------- Patients ---------------------------------------------------------

create table if not exists public.patients (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete restrict,
  mrn                text not null check (char_length(mrn) between 1 and 64),
  given_name         text not null,
  family_name        text not null,
  preferred_name     text,
  date_of_birth      date not null,
  sex_at_birth       public.sex_at_birth not null,
  gender_identity    text,
  pronouns           text,
  deceased_at        timestamptz,
  ssn_hash           text,   -- sha256(ssn || per-tenant salt); never plaintext
  ssn_last4          char(4),
  preferred_language text default 'en-US',
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (tenant_id, mrn)
);

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

create index if not exists patients_tenant_name_idx
  on public.patients using gin (
    tenant_id,
    (lower(given_name) || ' ' || lower(family_name)) gin_trgm_ops
  );
create index if not exists patients_tenant_dob_idx
  on public.patients (tenant_id, date_of_birth)
  where deleted_at is null;
create index if not exists patients_tenant_created_idx
  on public.patients (tenant_id, created_at desc)
  where deleted_at is null;

alter table public.patients enable row level security;

drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:read', tenant_id)
  );

drop policy if exists patients_write on public.patients;
create policy patients_write on public.patients
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:write', tenant_id)
  );

drop trigger if exists patients_audit on public.patients;
create trigger patients_audit
  after insert or update or delete on public.patients
  for each row execute function audit.log_change();

-- ---------- Patient contacts -------------------------------------------------

create table if not exists public.patient_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete restrict,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  type        public.contact_type not null,
  value       text not null,
  is_primary  boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

drop trigger if exists patient_contacts_set_updated_at on public.patient_contacts;
create trigger patient_contacts_set_updated_at
  before update on public.patient_contacts
  for each row execute function public.set_updated_at();

create index if not exists patient_contacts_patient_idx
  on public.patient_contacts (patient_id) where deleted_at is null;
create unique index if not exists patient_contacts_primary_per_type_idx
  on public.patient_contacts (patient_id, type)
  where is_primary and deleted_at is null;

alter table public.patient_contacts enable row level security;

drop policy if exists patient_contacts_rls on public.patient_contacts;
create policy patient_contacts_rls on public.patient_contacts
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:write', tenant_id)
  );

drop trigger if exists patient_contacts_audit on public.patient_contacts;
create trigger patient_contacts_audit
  after insert or update or delete on public.patient_contacts
  for each row execute function audit.log_change();

-- ---------- Encounters -------------------------------------------------------

create table if not exists public.encounters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  patient_id    uuid not null references public.patients(id) on delete restrict,
  provider_id   uuid not null references auth.users(id) on delete restrict,
  class         public.encounter_class not null default 'ambulatory',
  status        public.encounter_status not null default 'planned',
  reason        text,
  start_at      timestamptz not null,
  end_at        timestamptz,
  location      text,
  chief_complaint text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (end_at is null or end_at >= start_at)
);

drop trigger if exists encounters_set_updated_at on public.encounters;
create trigger encounters_set_updated_at
  before update on public.encounters
  for each row execute function public.set_updated_at();

create index if not exists encounters_tenant_start_idx
  on public.encounters (tenant_id, start_at desc)
  where deleted_at is null;
create index if not exists encounters_patient_start_idx
  on public.encounters (patient_id, start_at desc)
  where deleted_at is null;
create index if not exists encounters_provider_start_idx
  on public.encounters (provider_id, start_at desc)
  where deleted_at is null;
create index if not exists encounters_tenant_status_idx
  on public.encounters (tenant_id, status)
  where deleted_at is null;

alter table public.encounters enable row level security;

drop policy if exists encounters_select on public.encounters;
create policy encounters_select on public.encounters
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  );

drop policy if exists encounters_write on public.encounters;
create policy encounters_write on public.encounters
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists encounters_audit on public.encounters;
create trigger encounters_audit
  after insert or update or delete on public.encounters
  for each row execute function audit.log_change();

-- ---------- Vitals -----------------------------------------------------------

create table if not exists public.vitals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete restrict,
  patient_id        uuid not null references public.patients(id) on delete cascade,
  encounter_id      uuid references public.encounters(id) on delete set null,
  recorded_at       timestamptz not null default now(),
  recorded_by       uuid references auth.users(id),
  systolic_mmhg     smallint check (systolic_mmhg between 40 and 260),
  diastolic_mmhg    smallint check (diastolic_mmhg between 20 and 200),
  heart_rate_bpm    smallint check (heart_rate_bpm between 20 and 300),
  respiratory_rate  smallint check (respiratory_rate between 4 and 80),
  temperature_c     numeric(4,1) check (temperature_c between 25 and 45),
  spo2_pct          smallint check (spo2_pct between 30 and 100),
  weight_kg         numeric(5,2) check (weight_kg > 0 and weight_kg < 500),
  height_cm         numeric(5,2) check (height_cm > 0 and height_cm < 300),
  bmi               numeric(4,1) generated always as (
    case
      when weight_kg is not null and height_cm is not null and height_cm > 0
      then round((weight_kg / ((height_cm/100.0) * (height_cm/100.0)))::numeric, 1)
      else null
    end
  ) stored,
  pain_score        smallint check (pain_score between 0 and 10),
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists vitals_patient_recorded_idx
  on public.vitals (patient_id, recorded_at desc);
create index if not exists vitals_encounter_idx on public.vitals (encounter_id);

alter table public.vitals enable row level security;

drop policy if exists vitals_rls on public.vitals;
create policy vitals_rls on public.vitals
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists vitals_audit on public.vitals;
create trigger vitals_audit
  after insert or update or delete on public.vitals
  for each row execute function audit.log_change();

-- ---------- Allergies --------------------------------------------------------

create table if not exists public.allergies (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  type           public.allergy_type not null,
  substance      text not null,
  substance_code text,
  reaction       text,
  severity       public.allergy_severity,
  onset_date     date,
  recorded_by    uuid references auth.users(id),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

drop trigger if exists allergies_set_updated_at on public.allergies;
create trigger allergies_set_updated_at
  before update on public.allergies
  for each row execute function public.set_updated_at();

create index if not exists allergies_patient_idx
  on public.allergies (patient_id) where deleted_at is null;

alter table public.allergies enable row level security;

drop policy if exists allergies_rls on public.allergies;
create policy allergies_rls on public.allergies
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists allergies_audit on public.allergies;
create trigger allergies_audit
  after insert or update or delete on public.allergies
  for each row execute function audit.log_change();

-- ---------- Problems ---------------------------------------------------------

create table if not exists public.problems (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  code_system    text not null default 'ICD-10',
  code           text not null,
  description    text not null,
  status         public.problem_status not null default 'active',
  onset_date     date,
  resolved_date  date,
  recorded_by    uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check (resolved_date is null or onset_date is null or resolved_date >= onset_date)
);

drop trigger if exists problems_set_updated_at on public.problems;
create trigger problems_set_updated_at
  before update on public.problems
  for each row execute function public.set_updated_at();

create index if not exists problems_patient_status_idx
  on public.problems (patient_id, status) where deleted_at is null;
create index if not exists problems_tenant_code_idx
  on public.problems (tenant_id, code_system, code);

alter table public.problems enable row level security;

drop policy if exists problems_rls on public.problems;
create policy problems_rls on public.problems
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists problems_audit on public.problems;
create trigger problems_audit
  after insert or update or delete on public.problems
  for each row execute function audit.log_change();

-- ---------- Medications ------------------------------------------------------

create table if not exists public.medications (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete restrict,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  rxnorm_code      text,
  display_name     text not null,
  dose             text,
  route            text,
  frequency        text,
  status           public.medication_status not null default 'active',
  start_date       date,
  end_date         date,
  prescribing_provider_id uuid references auth.users(id),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);

drop trigger if exists medications_set_updated_at on public.medications;
create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();

create index if not exists medications_patient_status_idx
  on public.medications (patient_id, status) where deleted_at is null;
create index if not exists medications_tenant_name_idx
  on public.medications using gin (tenant_id, display_name gin_trgm_ops);

alter table public.medications enable row level security;

drop policy if exists medications_rls on public.medications;
create policy medications_rls on public.medications
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists medications_audit on public.medications;
create trigger medications_audit
  after insert or update or delete on public.medications
  for each row execute function audit.log_change();

-- ---------- Immunizations ----------------------------------------------------

create table if not exists public.immunizations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  cvx_code       text,
  display_name   text not null,
  administered_on date not null,
  lot_number     text,
  site           text,
  route          text,
  administered_by uuid references auth.users(id),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

drop trigger if exists immunizations_set_updated_at on public.immunizations;
create trigger immunizations_set_updated_at
  before update on public.immunizations
  for each row execute function public.set_updated_at();

create index if not exists immunizations_patient_date_idx
  on public.immunizations (patient_id, administered_on desc);

alter table public.immunizations enable row level security;

drop policy if exists immunizations_rls on public.immunizations;
create policy immunizations_rls on public.immunizations
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('clinical:write', tenant_id)
  );

drop trigger if exists immunizations_audit on public.immunizations;
create trigger immunizations_audit
  after insert or update or delete on public.immunizations
  for each row execute function audit.log_change();
