-- =============================================================================
-- 0001 — Extensions, audit schema, generic triggers
-- =============================================================================
-- Tenant-dependent helper functions live in 0002 once `tenant_members` exists.
-- =============================================================================

-- ---------- Extensions -------------------------------------------------------

create extension if not exists "pgcrypto"   with schema extensions;
create extension if not exists "citext"     with schema extensions;
create extension if not exists "pg_trgm"    with schema extensions;
create extension if not exists "btree_gin"  with schema extensions;
create extension if not exists "btree_gist" with schema extensions;
create extension if not exists "vector"     with schema extensions;

-- ---------- Schemas ----------------------------------------------------------

create schema if not exists audit;
grant usage on schema audit to authenticated, service_role;

-- ---------- Generic updated_at trigger function ------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Audit log --------------------------------------------------------

create table if not exists audit.audit_events (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  tenant_id       uuid,
  actor_id        uuid,
  request_id      text,
  table_schema    text not null,
  table_name      text not null,
  row_id          text,
  action          text not null check (action in ('INSERT','UPDATE','DELETE')),
  before          jsonb,
  after           jsonb,
  ip              inet,
  user_agent      text
);

create index if not exists audit_events_tenant_time_idx
  on audit.audit_events (tenant_id, occurred_at desc);
create index if not exists audit_events_table_row_idx
  on audit.audit_events (table_schema, table_name, row_id);
create index if not exists audit_events_actor_time_idx
  on audit.audit_events (actor_id, occurred_at desc);

revoke update, delete on audit.audit_events from authenticated, anon, service_role;
grant select, insert on audit.audit_events to service_role, authenticated;

alter table audit.audit_events enable row level security;

-- RLS policies for audit.audit_events are added in 0002 once the tenancy
-- helper functions exist.

-- ---------- Audit trigger function -------------------------------------------

create or replace function audit.log_change()
returns trigger
language plpgsql
security definer
set search_path = public, audit, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_tenant_id uuid;
  v_row_id text;
begin
  if (tg_op = 'DELETE') then
    v_before := to_jsonb(old);
    v_tenant_id := (v_before ->> 'tenant_id')::uuid;
    v_row_id := v_before ->> 'id';
  elsif (tg_op = 'UPDATE') then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_tenant_id := coalesce((v_after ->> 'tenant_id')::uuid, (v_before ->> 'tenant_id')::uuid);
    v_row_id := v_after ->> 'id';
  else
    v_after := to_jsonb(new);
    v_tenant_id := (v_after ->> 'tenant_id')::uuid;
    v_row_id := v_after ->> 'id';
  end if;

  insert into audit.audit_events (
    tenant_id, actor_id, table_schema, table_name, row_id,
    action, before, after
  )
  values (
    v_tenant_id, auth.uid(), tg_table_schema, tg_table_name, v_row_id,
    tg_op, v_before, v_after
  );

  if (tg_op = 'DELETE') then
    return old;
  else
    return new;
  end if;
end;
$$;

comment on function audit.log_change is
  'Attach AFTER INSERT OR UPDATE OR DELETE trigger to any tenant-scoped table.';
