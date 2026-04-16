-- =============================================================================
-- 0009 — Monetization: subscriptions, usage meters, entitlements
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.subscription_status as enum (
    'trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.usage_meter_key as enum (
    'ai_completions','encounters','seats','storage_gb','api_calls','claims_submitted','notifications_sent'
  );
exception when duplicate_object then null; end $$;

-- ---------- Subscriptions ----------------------------------------------------

create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  plan                     public.tenant_plan not null,
  status                   public.subscription_status not null default 'trialing',
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  trial_end                timestamptz,
  cancel_at                timestamptz,
  canceled_at              timestamptz,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tenant_id)
);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_period_end_idx on public.subscriptions (current_period_end);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

-- Subscriptions are written by the monetization service via service_role.
revoke insert, update, delete on public.subscriptions from authenticated, anon;

drop trigger if exists subscriptions_audit on public.subscriptions;
create trigger subscriptions_audit
  after insert or update or delete on public.subscriptions
  for each row execute function audit.log_change();

-- ---------- Usage events -----------------------------------------------------

create table if not exists public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  meter        public.usage_meter_key not null,
  quantity     numeric(14,3) not null check (quantity >= 0),
  occurred_at  timestamptz not null default now(),
  reference    text,                       -- links back to the event (request_id, encounter_id, etc.)
  metadata     jsonb not null default '{}'::jsonb,
  reported_to_processor_at timestamptz,    -- when rolled up to Stripe
  created_at   timestamptz not null default now()
);

create index if not exists usage_events_tenant_meter_time_idx
  on public.usage_events (tenant_id, meter, occurred_at desc);
create index if not exists usage_events_unreported_idx
  on public.usage_events (tenant_id, meter)
  where reported_to_processor_at is null;

alter table public.usage_events enable row level security;

drop policy if exists usage_events_select on public.usage_events;
create policy usage_events_select on public.usage_events
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  );

-- Only service_role writes usage events (metered by the monetization-service).
revoke insert, update, delete on public.usage_events from authenticated, anon;

-- ---------- Entitlements -----------------------------------------------------

create table if not exists public.entitlements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  feature        text not null,         -- e.g. 'ai.clinical_summaries', 'fhir.export'
  enabled        boolean not null default true,
  quota          numeric(14,3),         -- null = unlimited
  period         text check (period in ('day','month','year','cycle') or period is null),
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, feature)
);

drop trigger if exists entitlements_set_updated_at on public.entitlements;
create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

create index if not exists entitlements_tenant_idx on public.entitlements (tenant_id);

alter table public.entitlements enable row level security;

drop policy if exists entitlements_select on public.entitlements;
create policy entitlements_select on public.entitlements
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

revoke insert, update, delete on public.entitlements from authenticated, anon;

-- ---------- Monthly usage rollup view ---------------------------------------

create or replace view public.usage_monthly as
select
  tenant_id,
  meter,
  date_trunc('month', occurred_at) as period_start,
  sum(quantity) as total_quantity,
  count(*) as event_count
from public.usage_events
group by 1,2,3;

-- View inherits RLS from the base table.
