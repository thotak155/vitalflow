-- =============================================================================
-- 0006 — Scheduling + inventory
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.appointment_status as enum (
    'scheduled','confirmed','arrived','in_progress','completed',
    'cancelled','no_show','rescheduled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inventory_txn_type as enum (
    'receipt','dispense','waste','transfer','adjustment','return'
  );
exception when duplicate_object then null; end $$;

-- ---------- Locations (shared by scheduling + inventory) --------------------

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete restrict,
  name       text not null,
  code       text,
  address    jsonb,
  timezone   text not null default 'UTC',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and public.has_permission('admin:tenant', tenant_id))
  with check (tenant_id in (select public.current_user_tenant_ids()) and public.has_permission('admin:tenant', tenant_id));

drop trigger if exists locations_audit on public.locations;
create trigger locations_audit
  after insert or update or delete on public.locations
  for each row execute function audit.log_change();

-- ---------- Staff schedules --------------------------------------------------

create table if not exists public.staff_schedules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  provider_id  uuid not null references auth.users(id) on delete cascade,
  location_id  uuid references public.locations(id) on delete set null,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  slot_minutes smallint not null default 20 check (slot_minutes between 5 and 240),
  capacity     smallint not null default 1 check (capacity >= 1),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at > start_at)
);

drop trigger if exists staff_schedules_set_updated_at on public.staff_schedules;
create trigger staff_schedules_set_updated_at
  before update on public.staff_schedules
  for each row execute function public.set_updated_at();

create index if not exists staff_schedules_provider_time_idx
  on public.staff_schedules (provider_id, start_at);
create index if not exists staff_schedules_tenant_time_idx
  on public.staff_schedules (tenant_id, start_at);

alter table public.staff_schedules enable row level security;

drop policy if exists staff_schedules_rls on public.staff_schedules;
create policy staff_schedules_rls on public.staff_schedules
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()) and public.has_permission('admin:users', tenant_id));

drop trigger if exists staff_schedules_audit on public.staff_schedules;
create trigger staff_schedules_audit
  after insert or update or delete on public.staff_schedules
  for each row execute function audit.log_change();

-- ---------- Appointments -----------------------------------------------------

create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  patient_id    uuid not null references public.patients(id) on delete restrict,
  provider_id   uuid not null references auth.users(id) on delete restrict,
  location_id   uuid references public.locations(id) on delete set null,
  encounter_id  uuid references public.encounters(id) on delete set null,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  status        public.appointment_status not null default 'scheduled',
  reason        text,
  visit_type    text,
  telehealth_url text,
  booked_by     uuid references auth.users(id),
  cancelled_at  timestamptz,
  cancelled_reason text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_at > start_at)
);

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create index if not exists appointments_tenant_start_idx on public.appointments (tenant_id, start_at);
create index if not exists appointments_patient_start_idx on public.appointments (patient_id, start_at desc);
create index if not exists appointments_provider_start_idx on public.appointments (provider_id, start_at);
create index if not exists appointments_status_start_idx
  on public.appointments (tenant_id, status, start_at)
  where status in ('scheduled','confirmed');

-- Prevent double-booking for the same provider in the same time slot.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (
    provider_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status not in ('cancelled','no_show','rescheduled'));

alter table public.appointments enable row level security;

drop policy if exists appointments_rls on public.appointments;
create policy appointments_rls on public.appointments
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:read', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('patient:write', tenant_id)
  );

drop trigger if exists appointments_audit on public.appointments;
create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute function audit.log_change();

-- ---------- Inventory items --------------------------------------------------

create table if not exists public.inventory_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  location_id     uuid references public.locations(id) on delete set null,
  sku             text,
  name            text not null,
  ndc_code        text,    -- for drugs
  lot_number      text,
  expiration_date date,
  unit            text not null default 'each',
  cost_minor      integer check (cost_minor is null or cost_minor >= 0),
  price_minor     integer check (price_minor is null or price_minor >= 0),
  currency        char(3) not null default 'USD',
  on_hand         numeric(14,3) not null default 0 check (on_hand >= 0),
  reorder_point   numeric(14,3),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (tenant_id, location_id, sku, lot_number)
);

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

create index if not exists inventory_items_tenant_name_idx
  on public.inventory_items using gin (tenant_id, name gin_trgm_ops);
create index if not exists inventory_items_reorder_idx
  on public.inventory_items (tenant_id)
  where on_hand <= reorder_point and deleted_at is null;
create index if not exists inventory_items_expiry_idx
  on public.inventory_items (tenant_id, expiration_date)
  where expiration_date is not null and deleted_at is null;

alter table public.inventory_items enable row level security;

drop policy if exists inventory_items_rls on public.inventory_items;
create policy inventory_items_rls on public.inventory_items
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  );

drop trigger if exists inventory_items_audit on public.inventory_items;
create trigger inventory_items_audit
  after insert or update or delete on public.inventory_items
  for each row execute function audit.log_change();

-- ---------- Inventory transactions -------------------------------------------

create table if not exists public.inventory_transactions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  item_id       uuid not null references public.inventory_items(id) on delete restrict,
  type          public.inventory_txn_type not null,
  quantity      numeric(14,3) not null,
  reference     text,   -- order_id, patient_id, PO number
  performed_by  uuid references auth.users(id),
  occurred_at   timestamptz not null default now(),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists inventory_txn_item_time_idx
  on public.inventory_transactions (item_id, occurred_at desc);
create index if not exists inventory_txn_tenant_time_idx
  on public.inventory_transactions (tenant_id, occurred_at desc);

alter table public.inventory_transactions enable row level security;

drop policy if exists inventory_txn_rls on public.inventory_transactions;
create policy inventory_txn_rls on public.inventory_transactions
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

drop trigger if exists inventory_txn_audit on public.inventory_transactions;
create trigger inventory_txn_audit
  after insert or update or delete on public.inventory_transactions
  for each row execute function audit.log_change();

-- Maintain on_hand via trigger.
create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
as $$
declare
  v_delta numeric(14,3);
begin
  v_delta := case new.type
    when 'receipt'    then new.quantity
    when 'return'     then new.quantity
    when 'dispense'   then -new.quantity
    when 'waste'      then -new.quantity
    when 'transfer'   then -new.quantity
    when 'adjustment' then new.quantity
  end;
  update public.inventory_items
    set on_hand = on_hand + v_delta
    where id = new.item_id;
  return new;
end;
$$;

drop trigger if exists inventory_txn_apply on public.inventory_transactions;
create trigger inventory_txn_apply
  after insert on public.inventory_transactions
  for each row execute function public.apply_inventory_transaction();
