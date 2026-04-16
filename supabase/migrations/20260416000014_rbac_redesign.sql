-- =============================================================================
-- 0014 — RBAC redesign: staff roles, platform admins, patient portal linkage,
--         impersonation, user-kind separation
-- =============================================================================
-- Replaces the initial coarse `public.role` enum with three disjoint concepts:
--   - public.staff_role   — per-tenant clinical/ops roles (stored in tenant_members.roles[])
--   - public.platform_role — above-tenants roles (stored in platform_admins.role)
--   - patient (user_kind) — not a role; a distinct user class bound via patient_portal_links
--
-- Adds profiles.user_kind for cast-iron separation between staff, patient,
-- platform, and service accounts. Rewrites has_permission() to use the full
-- permission catalog and to strip signing permissions during impersonation.
-- =============================================================================

-- ---------- 1. Enums --------------------------------------------------------

do $$ begin
  create type public.staff_role as enum (
    'practice_owner',
    'office_admin',
    'physician',
    'nurse_ma',
    'scheduler',
    'biller'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.platform_role as enum (
    'super_admin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_kind as enum (
    'staff',
    'patient',
    'platform',
    'service'
  );
exception when duplicate_object then null; end $$;

-- ---------- 2. Migrate existing role[] columns ------------------------------
-- We drop the old role-typed columns and replace with staff_role[]. Safe
-- because the tables are empty in all environments at this stage.

alter table public.tenant_members drop column if exists roles;
alter table public.tenant_members
  add column roles public.staff_role[] not null default '{}'::public.staff_role[]
    check (array_length(roles, 1) >= 1);

alter table public.invitations drop column if exists roles;
alter table public.invitations
  add column roles public.staff_role[] not null default '{}'::public.staff_role[]
    check (array_length(roles, 1) >= 1);

-- Old enum is unused now; leave it in place for a migration window. It can be
-- dropped in a later migration once we're confident nothing else references it.

-- ---------- 3. profiles.user_kind ------------------------------------------

alter table public.profiles
  add column if not exists user_kind public.user_kind not null default 'staff';

-- Make existing handle_new_user trigger set user_kind from raw_user_meta_data
-- so sign-ups can declare their kind at creation time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind public.user_kind;
begin
  v_kind := coalesce(
    (new.raw_user_meta_data ->> 'user_kind')::public.user_kind,
    'staff'
  );
  insert into public.profiles (id, email, full_name, avatar_url, user_kind)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    v_kind
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- 4. Enforce staff-only membership via trigger --------------------

create or replace function public.enforce_staff_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind public.user_kind;
begin
  select user_kind into v_kind from public.profiles where id = new.user_id;
  if v_kind is null then
    raise exception 'tenant_members.user_id % has no profile', new.user_id
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_kind <> 'staff' then
    raise exception 'tenant_members requires user_kind = staff (got %)', v_kind
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_members_enforce_staff on public.tenant_members;
create trigger tenant_members_enforce_staff
  before insert or update on public.tenant_members
  for each row execute function public.enforce_staff_membership();

-- Block self-granting of practice_owner — only an existing owner or a
-- platform admin can grant it.
create or replace function public.enforce_owner_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grantor_is_owner boolean;
  v_grantor_is_platform_admin boolean;
begin
  if not ('practice_owner' = any (new.roles)) then
    return new;
  end if;

  -- Bootstrap: first member of a tenant can be owner.
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = new.tenant_id and deleted_at is null
      and id is distinct from new.id
  ) then
    return new;
  end if;

  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = new.tenant_id
      and tm.user_id = auth.uid()
      and tm.deleted_at is null
      and 'practice_owner' = any (tm.roles)
  ) into v_grantor_is_owner;

  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  ) into v_grantor_is_platform_admin;

  if not (v_grantor_is_owner or v_grantor_is_platform_admin) then
    raise exception 'Only a practice_owner or super_admin can grant practice_owner'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Trigger created after platform_admins exists (below).

-- ---------- 5. Platform admins ---------------------------------------------

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.platform_role not null default 'super_admin',
  webauthn_required boolean not null default true,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists platform_admins_active_idx
  on public.platform_admins (role) where revoked_at is null;

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes via service_role only.
revoke insert, update, delete on public.platform_admins from authenticated, anon;

-- Convenience helper used by RLS elsewhere.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid()
      and revoked_at is null
  );
$$;

-- Now that platform_admins exists, install the owner-grant enforcement trigger.
drop trigger if exists tenant_members_enforce_owner on public.tenant_members;
create trigger tenant_members_enforce_owner
  before insert or update on public.tenant_members
  for each row execute function public.enforce_owner_grant();

-- ---------- 6. Impersonation sessions --------------------------------------

create table if not exists public.impersonation_sessions (
  id                uuid primary key default gen_random_uuid(),
  impersonator_id   uuid not null references auth.users(id) on delete cascade,
  target_user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  reason            text not null check (char_length(reason) >= 20),
  approved_by       uuid references auth.users(id),  -- 2nd super_admin, required in prod
  started_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_reason    text,
  ip                inet,
  user_agent        text,
  check (expires_at > started_at),
  check (expires_at <= started_at + interval '4 hours')
);

create index if not exists impersonation_sessions_active_idx
  on public.impersonation_sessions (impersonator_id)
  where revoked_at is null;
create index if not exists impersonation_sessions_target_idx
  on public.impersonation_sessions (target_user_id, started_at desc);

alter table public.impersonation_sessions enable row level security;

drop policy if exists impersonation_sessions_select on public.impersonation_sessions;
create policy impersonation_sessions_select on public.impersonation_sessions
  for select to authenticated
  using (
    impersonator_id = (select auth.uid())
    or target_user_id = (select auth.uid())
    or (select public.is_platform_admin())
  );

revoke insert, update, delete on public.impersonation_sessions from authenticated, anon;

-- Is the caller currently impersonating?
create or replace function public.current_impersonation()
returns table (
  session_id       uuid,
  impersonator_id  uuid,
  target_user_id   uuid,
  tenant_id        uuid,
  expires_at       timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.impersonator_id, s.target_user_id, s.tenant_id, s.expires_at
  from public.impersonation_sessions s
  where s.impersonator_id = auth.uid()
    and s.revoked_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;

-- ---------- 7. Patient portal links ----------------------------------------

create table if not exists public.patient_portal_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (user_id, tenant_id, patient_id)
);

drop trigger if exists patient_portal_links_set_updated_at on public.patient_portal_links;
create trigger patient_portal_links_set_updated_at
  before update on public.patient_portal_links
  for each row execute function public.set_updated_at();

create index if not exists patient_portal_links_user_idx
  on public.patient_portal_links (user_id) where deleted_at is null;
create index if not exists patient_portal_links_patient_idx
  on public.patient_portal_links (patient_id) where deleted_at is null;

alter table public.patient_portal_links enable row level security;

drop policy if exists patient_portal_links_select on public.patient_portal_links;
create policy patient_portal_links_select on public.patient_portal_links
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.patient_portal_links from authenticated, anon;

-- Enforce patient-only linkage via trigger.
create or replace function public.enforce_patient_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind public.user_kind;
begin
  select user_kind into v_kind from public.profiles where id = new.user_id;
  if v_kind is distinct from 'patient' then
    raise exception 'patient_portal_links requires user_kind = patient (got %)', v_kind
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists patient_portal_links_enforce_kind on public.patient_portal_links;
create trigger patient_portal_links_enforce_kind
  before insert or update on public.patient_portal_links
  for each row execute function public.enforce_patient_link();

-- Helper for RLS on patient-self surfaces.
create or replace function public.current_user_patient_ids(p_tenant_id uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.patient_id
  from public.patient_portal_links l
  where l.user_id = auth.uid()
    and l.deleted_at is null
    and l.verified_at is not null
    and (p_tenant_id is null or l.tenant_id = p_tenant_id);
$$;

-- ---------- 8. Rewrite current_user_roles + has_permission ------------------

create or replace function public.current_user_roles(p_tenant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select array_agg(distinct r::text)
     from public.tenant_members tm, unnest(tm.roles) as r
     where tm.user_id = auth.uid()
       and tm.tenant_id = p_tenant_id
       and tm.deleted_at is null),
    array[]::text[]
  );
$$;

-- Full permission catalog, mirrored in @vitalflow/auth/rbac.ts. Stripping of
-- signing/financial permissions during impersonation happens here too.
create or replace function public.has_permission(
  p_permission text,
  p_tenant_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles text[];
  v_perms text[] := array[]::text[];
  v_imp record;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Patient self-permissions: fixed set, no role needed.
  if p_permission in ('self:read', 'self:write', 'self:message_care_team', 'self:book_appointment') then
    return exists (
      select 1 from public.patient_portal_links l
      where l.user_id = auth.uid()
        and l.deleted_at is null
        and l.verified_at is not null
        and (p_tenant_id is null or l.tenant_id = p_tenant_id)
    );
  end if;

  if p_tenant_id is null then
    select array_agg(distinct r::text) into v_roles
    from public.tenant_members tm, unnest(tm.roles) as r
    where tm.user_id = auth.uid() and tm.deleted_at is null;
  else
    v_roles := public.current_user_roles(p_tenant_id);
  end if;

  if v_roles is null or array_length(v_roles, 1) is null then
    return false;
  end if;

  if 'practice_owner' = any (v_roles) then
    v_perms := v_perms || array[
      'clinical:read','clinical:write','clinical:sign','clinical:amend',
      'patient:read','patient:write',
      'rx:create','rx:sign','rx:refill',
      'order:create','order:resolve',
      'schedule:read','schedule:write',
      'billing:read','billing:write','billing:collect','billing:adjust','billing:write_off',
      'admin:tenant','admin:users','admin:billing_config','admin:integrations',
      'audit:read','ai:invoke'
    ];
  end if;
  if 'office_admin' = any (v_roles) then
    v_perms := v_perms || array[
      'admin:tenant','admin:users','admin:billing_config','admin:integrations',
      'billing:read','billing:write','billing:collect','billing:adjust','billing:write_off',
      'schedule:read','schedule:write',
      'patient:read','patient:write',
      'audit:read'
    ];
  end if;
  if 'physician' = any (v_roles) then
    v_perms := v_perms || array[
      'clinical:read','clinical:write','clinical:sign','clinical:amend',
      'patient:read','patient:write',
      'rx:create','rx:sign','rx:refill',
      'order:create','order:resolve',
      'schedule:read',
      'ai:invoke'
    ];
  end if;
  if 'nurse_ma' = any (v_roles) then
    v_perms := v_perms || array[
      'clinical:read','clinical:write',
      'patient:read','patient:write',
      'order:create',
      'schedule:read',
      'ai:invoke'
    ];
  end if;
  if 'scheduler' = any (v_roles) then
    v_perms := v_perms || array[
      'schedule:read','schedule:write',
      'patient:read','patient:demographics_only'
    ];
  end if;
  if 'biller' = any (v_roles) then
    v_perms := v_perms || array[
      'billing:read','billing:write','billing:collect','billing:adjust','billing:write_off',
      'clinical:read',
      'patient:read'
    ];
  end if;

  -- Strip high-risk permissions while impersonating.
  select * into v_imp from public.current_impersonation();
  if v_imp.session_id is not null then
    v_perms := array(
      select p from unnest(v_perms) as p
      where p not in (
        'clinical:sign','rx:sign','billing:adjust','billing:write_off','admin:users'
      )
    );
  end if;

  return p_permission = any (v_perms);
end;
$$;

-- ---------- 9. BAA guard ----------------------------------------------------
-- Block clinical writes on tenants without a signed BAA. Only patients and
-- encounters are guarded by default — tighten to more tables as they ship.

create or replace function public.require_baa_signed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_signed boolean;
begin
  select hipaa_baa_signed into v_signed from public.tenants where id = new.tenant_id;
  if v_signed is not true then
    raise exception 'Tenant % has not signed BAA; PHI writes are blocked', new.tenant_id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists patients_baa_guard on public.patients;
create trigger patients_baa_guard
  before insert or update on public.patients
  for each row execute function public.require_baa_signed();

drop trigger if exists encounters_baa_guard on public.encounters;
create trigger encounters_baa_guard
  before insert or update on public.encounters
  for each row execute function public.require_baa_signed();

-- ---------- 10. Audit helper: record impersonator_id ------------------------
-- Extend the existing audit.log_change function to include impersonator_id.

alter table audit.audit_events
  add column if not exists impersonator_id uuid;

create index if not exists audit_events_impersonator_idx
  on audit.audit_events (impersonator_id, occurred_at desc)
  where impersonator_id is not null;

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
  v_impersonator uuid;
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

  select s.impersonator_id into v_impersonator
  from public.current_impersonation() s;

  insert into audit.audit_events (
    tenant_id, actor_id, impersonator_id, table_schema, table_name, row_id,
    action, before, after
  )
  values (
    v_tenant_id, auth.uid(), v_impersonator, tg_table_schema, tg_table_name, v_row_id,
    tg_op, v_before, v_after
  );

  if (tg_op = 'DELETE') then
    return old;
  else
    return new;
  end if;
end;
$$;
