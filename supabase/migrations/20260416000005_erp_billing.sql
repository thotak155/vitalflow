-- =============================================================================
-- 0005 — ERP billing: payers, coverages, charges, invoices, payments, claims
-- =============================================================================
-- Money is stored as minor-unit integers with an explicit ISO-4217 currency
-- code. Never use floats for money.
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.invoice_status as enum ('draft','issued','paid','partial','void','written_off','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash','check','card','ach','insurance','credit_adjust','write_off','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_status as enum ('draft','ready','submitted','accepted','rejected','paid','partial','denied','appealed','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coverage_type as enum ('primary','secondary','tertiary','self_pay','workers_comp','auto','other');
exception when duplicate_object then null; end $$;

-- ---------- Payers -----------------------------------------------------------

create table if not exists public.payers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  name          text not null,
  payer_code    text,            -- X12 payer id, NAIC, etc.
  edi_sender_id text,
  claims_address jsonb,
  phone         text,
  fax           text,
  website       text,
  metadata      jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, name)
);

drop trigger if exists payers_set_updated_at on public.payers;
create trigger payers_set_updated_at
  before update on public.payers
  for each row execute function public.set_updated_at();

create index if not exists payers_tenant_idx on public.payers(tenant_id) where active;

alter table public.payers enable row level security;

drop policy if exists payers_select on public.payers;
create policy payers_select on public.payers
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  );

drop policy if exists payers_write on public.payers;
create policy payers_write on public.payers
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists payers_audit on public.payers;
create trigger payers_audit
  after insert or update or delete on public.payers
  for each row execute function audit.log_change();

-- ---------- Patient coverages ------------------------------------------------

create table if not exists public.patient_coverages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  payer_id        uuid not null references public.payers(id) on delete restrict,
  type            public.coverage_type not null default 'primary',
  plan_name       text,
  member_id       text not null,
  group_number    text,
  subscriber_name text,
  relationship    text check (relationship in ('self','spouse','child','other') or relationship is null),
  effective_start date,
  effective_end   date,
  copay_minor     integer check (copay_minor is null or copay_minor >= 0),
  deductible_minor integer check (deductible_minor is null or deductible_minor >= 0),
  currency        char(3) not null default 'USD',
  active          boolean not null default true,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (effective_end is null or effective_start is null or effective_end >= effective_start)
);

drop trigger if exists patient_coverages_set_updated_at on public.patient_coverages;
create trigger patient_coverages_set_updated_at
  before update on public.patient_coverages
  for each row execute function public.set_updated_at();

create index if not exists patient_coverages_patient_idx
  on public.patient_coverages (patient_id, type) where active;
create index if not exists patient_coverages_payer_idx
  on public.patient_coverages (payer_id) where active;

alter table public.patient_coverages enable row level security;

drop policy if exists patient_coverages_rls on public.patient_coverages;
create policy patient_coverages_rls on public.patient_coverages
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists patient_coverages_audit on public.patient_coverages;
create trigger patient_coverages_audit
  after insert or update or delete on public.patient_coverages
  for each row execute function audit.log_change();

-- ---------- Charges ----------------------------------------------------------

create table if not exists public.charges (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  patient_id     uuid not null references public.patients(id) on delete restrict,
  encounter_id   uuid references public.encounters(id) on delete set null,
  order_id       uuid references public.orders(id) on delete set null,
  cpt_code       text,
  hcpcs_code     text,
  revenue_code   text,
  icd10_codes    text[] not null default '{}'::text[],
  modifiers      text[] not null default '{}'::text[],
  units          numeric(10,3) not null default 1 check (units > 0),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  total_minor    integer not null generated always as (
    (unit_price_minor * units)::integer
  ) stored,
  currency       char(3) not null default 'USD',
  service_date   date not null,
  posted_at      timestamptz,
  posted_by      uuid references auth.users(id),
  status         text not null default 'draft'
                 check (status in ('draft','posted','billed','voided')),
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists charges_set_updated_at on public.charges;
create trigger charges_set_updated_at
  before update on public.charges
  for each row execute function public.set_updated_at();

create index if not exists charges_patient_date_idx
  on public.charges (patient_id, service_date desc);
create index if not exists charges_tenant_status_idx
  on public.charges (tenant_id, status);
create index if not exists charges_encounter_idx on public.charges (encounter_id);

alter table public.charges enable row level security;

drop policy if exists charges_rls on public.charges;
create policy charges_rls on public.charges
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists charges_audit on public.charges;
create trigger charges_audit
  after insert or update or delete on public.charges
  for each row execute function audit.log_change();

-- ---------- Invoices ---------------------------------------------------------

create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  patient_id      uuid not null references public.patients(id) on delete restrict,
  number          text not null default ('INV-' || to_char(nextval('public.invoice_number_seq'), 'FM000000000')),
  status          public.invoice_status not null default 'draft',
  issued_at       timestamptz,
  due_at          timestamptz,
  currency        char(3) not null default 'USD',
  subtotal_minor  integer not null default 0,
  tax_minor       integer not null default 0,
  total_minor     integer not null default 0,
  balance_minor   integer not null default 0,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, number)
);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index if not exists invoices_tenant_status_idx on public.invoices (tenant_id, status);
create index if not exists invoices_patient_created_idx on public.invoices (patient_id, created_at desc);
create index if not exists invoices_due_idx on public.invoices (due_at) where status in ('issued','partial');

alter table public.invoices enable row level security;

drop policy if exists invoices_rls on public.invoices;
create policy invoices_rls on public.invoices
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists invoices_audit on public.invoices;
create trigger invoices_audit
  after insert or update or delete on public.invoices
  for each row execute function audit.log_change();

-- ---------- Invoice lines ----------------------------------------------------

create table if not exists public.invoice_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  invoice_id     uuid not null references public.invoices(id) on delete cascade,
  charge_id      uuid references public.charges(id) on delete set null,
  description    text not null,
  quantity       numeric(10,3) not null default 1,
  unit_price_minor integer not null,
  amount_minor   integer not null generated always as (
    (unit_price_minor * quantity)::integer
  ) stored,
  currency       char(3) not null default 'USD',
  line_order     smallint not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists invoice_lines_invoice_idx
  on public.invoice_lines (invoice_id, line_order);

alter table public.invoice_lines enable row level security;

drop policy if exists invoice_lines_rls on public.invoice_lines;
create policy invoice_lines_rls on public.invoice_lines
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists invoice_lines_audit on public.invoice_lines;
create trigger invoice_lines_audit
  after insert or update or delete on public.invoice_lines
  for each row execute function audit.log_change();

-- ---------- Payments ---------------------------------------------------------

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  invoice_id      uuid references public.invoices(id) on delete set null,
  patient_id      uuid references public.patients(id) on delete set null,
  payer_id        uuid references public.payers(id) on delete set null,
  method          public.payment_method not null,
  amount_minor    integer not null check (amount_minor > 0),
  currency        char(3) not null default 'USD',
  received_at     timestamptz not null default now(),
  reference       text,     -- check #, card last4, ACH trace, Stripe charge id
  processor       text,     -- 'stripe','manual','era'
  processor_ref   text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_tenant_received_idx
  on public.payments (tenant_id, received_at desc);

alter table public.payments enable row level security;

drop policy if exists payments_rls on public.payments;
create policy payments_rls on public.payments
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function audit.log_change();

-- ---------- Claims -----------------------------------------------------------

create sequence if not exists public.claim_number_seq;

create table if not exists public.claims (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete restrict,
  patient_id         uuid not null references public.patients(id) on delete restrict,
  payer_id           uuid not null references public.payers(id) on delete restrict,
  coverage_id        uuid references public.patient_coverages(id) on delete set null,
  number             text not null default ('CLM-' || to_char(nextval('public.claim_number_seq'), 'FM000000000')),
  status             public.claim_status not null default 'draft',
  billing_provider_id uuid references auth.users(id),
  rendering_provider_id uuid references auth.users(id),
  service_start_date date not null,
  service_end_date   date not null,
  total_minor        integer not null default 0,
  allowed_minor      integer,
  paid_minor         integer,
  patient_resp_minor integer,
  currency           char(3) not null default 'USD',
  submitted_at       timestamptz,
  adjudicated_at     timestamptz,
  external_claim_id  text,
  edi_envelope       text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (service_end_date >= service_start_date),
  unique (tenant_id, number)
);

drop trigger if exists claims_set_updated_at on public.claims;
create trigger claims_set_updated_at
  before update on public.claims
  for each row execute function public.set_updated_at();

create index if not exists claims_tenant_status_idx on public.claims (tenant_id, status);
create index if not exists claims_patient_idx on public.claims (patient_id, service_start_date desc);
create index if not exists claims_payer_idx on public.claims (payer_id, submitted_at desc);

alter table public.claims enable row level security;

drop policy if exists claims_rls on public.claims;
create policy claims_rls on public.claims
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists claims_audit on public.claims;
create trigger claims_audit
  after insert or update or delete on public.claims
  for each row execute function audit.log_change();

-- ---------- Claim lines ------------------------------------------------------

create table if not exists public.claim_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  claim_id       uuid not null references public.claims(id) on delete cascade,
  charge_id      uuid references public.charges(id) on delete set null,
  line_number    smallint not null,
  cpt_code       text,
  modifiers      text[] not null default '{}'::text[],
  icd10_codes    text[] not null default '{}'::text[],
  units          numeric(10,3) not null default 1,
  charge_minor   integer not null,
  allowed_minor  integer,
  paid_minor     integer,
  adjustment_minor integer,
  denial_codes   text[] not null default '{}'::text[],
  currency       char(3) not null default 'USD',
  service_date   date not null,
  created_at     timestamptz not null default now(),
  unique (claim_id, line_number)
);

create index if not exists claim_lines_claim_idx on public.claim_lines (claim_id, line_number);

alter table public.claim_lines enable row level security;

drop policy if exists claim_lines_rls on public.claim_lines;
create policy claim_lines_rls on public.claim_lines
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

drop trigger if exists claim_lines_audit on public.claim_lines;
create trigger claim_lines_audit
  after insert or update or delete on public.claim_lines
  for each row execute function audit.log_change();

-- ---------- Claim status history --------------------------------------------

create table if not exists public.claim_status_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  claim_id       uuid not null references public.claims(id) on delete cascade,
  from_status    public.claim_status,
  to_status      public.claim_status not null,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid references auth.users(id),
  message        text,
  payload        jsonb
);

create index if not exists claim_status_history_claim_idx
  on public.claim_status_history (claim_id, occurred_at desc);

alter table public.claim_status_history enable row level security;

drop policy if exists claim_status_history_rls on public.claim_status_history;
create policy claim_status_history_rls on public.claim_status_history
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );
