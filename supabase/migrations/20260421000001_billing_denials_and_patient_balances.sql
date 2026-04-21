-- =============================================================================
-- 0020 — Billing RCM V1: denials + patient_balances
-- =============================================================================
-- Adds the two tables missing from the V1 billing domain:
--   - denials: queueable, assignable denial work items. One row per denied
--     claim_line (or claim-level). Drives the denial queue UI + post-
--     adjudication reconciliation.
--   - patient_balances: cached rollup per (tenant_id, patient_id) with aging
--     buckets. Updated transactionally by PaymentService.record and
--     ChargeService.post; direct INSERT/UPDATE outside services is not
--     expected (RLS allows, check-constraint-enforced invariants only).
--
-- See docs/billing-rcm.md §3.3 and §3.5.
-- =============================================================================

-- ---------- denials ---------------------------------------------------------

create table if not exists public.denials (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  claim_id                 uuid not null references public.claims(id) on delete cascade,
  claim_line_id            uuid references public.claim_lines(id) on delete cascade,
  denial_codes             text[] not null default '{}',
  reason_text              text,
  status                   text not null default 'open',
  priority                 smallint not null default 3,
  assigned_to              uuid references auth.users(id),
  assigned_at              timestamptz,
  work_note                text,
  resolution               text,
  denied_amount_minor      bigint not null default 0,
  recovered_amount_minor   bigint not null default 0,
  currency                 char(3) not null default 'USD',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint denials_status_check check (
    status in ('open', 'working', 'appealed', 'resolved', 'written_off', 'uncollectable')
  ),
  constraint denials_priority_check check (priority between 1 and 5),
  constraint denials_amount_check check (denied_amount_minor >= 0),
  constraint denials_recovered_check check (
    recovered_amount_minor >= 0 and recovered_amount_minor <= denied_amount_minor
  ),
  constraint denials_codes_len check (cardinality(denial_codes) between 0 and 10)
);

-- Queue view index: open + working items, oldest first within priority.
create index if not exists denials_queue_idx
  on public.denials (tenant_id, priority, created_at)
  where status in ('open', 'working');

create index if not exists denials_claim_idx
  on public.denials (claim_id);

create index if not exists denials_assigned_to_idx
  on public.denials (tenant_id, assigned_to)
  where assigned_to is not null and status in ('open', 'working');

drop trigger if exists denials_set_updated_at on public.denials;
create trigger denials_set_updated_at
  before update on public.denials
  for each row execute function public.set_updated_at();

drop trigger if exists denials_audit on public.denials;
create trigger denials_audit
  after insert or update or delete on public.denials
  for each row execute function audit.log_change();

alter table public.denials enable row level security;

drop policy if exists denials_select on public.denials;
create policy denials_select on public.denials
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  );

drop policy if exists denials_write on public.denials;
create policy denials_write on public.denials
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

comment on table public.denials is
  'Denial work items. One row per denied claim_line (or claim-level). Queueable + assignable. See docs/billing-rcm.md §3.3.';
comment on column public.denials.status is
  'open → working → appealed → resolved | written_off | uncollectable. Terminal states cannot transition.';
comment on column public.denials.priority is
  '1 = urgent, 5 = low. Default 3. Drives queue ordering.';

-- ---------- patient_balances ------------------------------------------------

create table if not exists public.patient_balances (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  patient_id               uuid not null references public.patients(id) on delete cascade,
  current_balance_minor    bigint not null default 0,
  aging_0_30_minor         bigint not null default 0,
  aging_31_60_minor        bigint not null default 0,
  aging_61_90_minor        bigint not null default 0,
  aging_over_90_minor      bigint not null default 0,
  currency                 char(3) not null default 'USD',
  last_statement_at        timestamptz,
  last_payment_at          timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint patient_balances_unique unique (tenant_id, patient_id),
  constraint patient_balances_aging_sum check (
    aging_0_30_minor + aging_31_60_minor + aging_61_90_minor + aging_over_90_minor
      = current_balance_minor
  ),
  constraint patient_balances_aging_nonneg check (
    aging_0_30_minor >= 0
    and aging_31_60_minor >= 0
    and aging_61_90_minor >= 0
    and aging_over_90_minor >= 0
  )
);

create index if not exists patient_balances_over_90_idx
  on public.patient_balances (tenant_id, aging_over_90_minor desc)
  where aging_over_90_minor > 0;

create index if not exists patient_balances_outstanding_idx
  on public.patient_balances (tenant_id, current_balance_minor desc)
  where current_balance_minor > 0;

drop trigger if exists patient_balances_set_updated_at on public.patient_balances;
create trigger patient_balances_set_updated_at
  before update on public.patient_balances
  for each row execute function public.set_updated_at();

drop trigger if exists patient_balances_audit on public.patient_balances;
create trigger patient_balances_audit
  after insert or update or delete on public.patient_balances
  for each row execute function audit.log_change();

alter table public.patient_balances enable row level security;

drop policy if exists patient_balances_select on public.patient_balances;
create policy patient_balances_select on public.patient_balances
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:read', tenant_id)
  );

drop policy if exists patient_balances_write on public.patient_balances;
create policy patient_balances_write on public.patient_balances
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('billing:write', tenant_id)
  );

comment on table public.patient_balances is
  'Cached per-patient balance rollup with aging buckets. Updated transactionally by PaymentService + ChargeService. See docs/billing-rcm.md §3.5.';
comment on column public.patient_balances.current_balance_minor is
  'Can be negative — credit balance after overpayment. Sums aging buckets.';
