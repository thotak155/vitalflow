-- =============================================================================
-- 0002 — Tenancy, auth, profiles, membership, RBAC helpers, audit RLS
-- =============================================================================
-- Creates the multi-tenancy foundation plus the helper functions every
-- downstream RLS policy depends on.
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.tenant_plan as enum ('starter', 'growth', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tenant_region as enum ('us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.role as enum (
    'owner', 'admin', 'clinician', 'nurse',
    'billing', 'scheduler', 'patient', 'read_only'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- ---------- Tenants ----------------------------------------------------------

create table if not exists public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  slug                citext not null unique
                        check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  display_name        text not null check (char_length(display_name) between 1 and 128),
  plan                public.tenant_plan not null default 'starter',
  region              public.tenant_region not null default 'us-east-1',
  hipaa_baa_signed    boolean not null default false,
  hipaa_baa_signed_at timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create index if not exists tenants_plan_idx on public.tenants(plan) where deleted_at is null;

-- ---------- Profiles (mirror of auth.users) ----------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext not null,
  full_name    text,
  avatar_url   text,
  locale       text not null default 'en-US',
  timezone     text not null default 'UTC',
  phone        text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create unique index if not exists profiles_email_idx on public.profiles(email);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Tenant membership -----------------------------------------------

create table if not exists public.tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  roles      public.role[] not null default '{}'::public.role[]
              check (array_length(roles, 1) >= 1),
  status     text not null default 'active'
              check (status in ('active', 'suspended')),
  invited_by uuid references auth.users(id),
  joined_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, user_id)
);

drop trigger if exists tenant_members_set_updated_at on public.tenant_members;
create trigger tenant_members_set_updated_at
  before update on public.tenant_members
  for each row execute function public.set_updated_at();

create index if not exists tenant_members_user_idx
  on public.tenant_members(user_id) where deleted_at is null;
create index if not exists tenant_members_tenant_idx
  on public.tenant_members(tenant_id) where deleted_at is null;

-- ---------- Invitations ------------------------------------------------------

create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       citext not null,
  roles       public.role[] not null check (array_length(roles, 1) >= 1),
  token_hash  text not null,
  invited_by  uuid not null references auth.users(id),
  status      public.invitation_status not null default 'pending',
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, email, status)
);

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

create index if not exists invitations_tenant_status_idx
  on public.invitations(tenant_id, status);
create index if not exists invitations_email_idx on public.invitations(email);

-- ---------- RBAC helper functions (now that tenant_members exists) ----------

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tm.tenant_id
  from public.tenant_members tm
  where tm.user_id = auth.uid()
    and tm.deleted_at is null;
$$;

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

create or replace function public.has_permission(p_permission text, p_tenant_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles text[];
  v_permissions text[];
begin
  if auth.uid() is null then
    return false;
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

  v_permissions := case
    when 'owner' = any(v_roles) then array[
      'clinical:read','clinical:write','clinical:sign',
      'patient:read','patient:write',
      'billing:read','billing:write',
      'admin:tenant','admin:users',
      'ai:invoke'
    ]
    else array[]::text[]
  end;

  if 'admin' = any(v_roles) then
    v_permissions := v_permissions || array[
      'clinical:read','patient:read','patient:write',
      'billing:read','billing:write','admin:users','ai:invoke'
    ];
  end if;
  if 'clinician' = any(v_roles) then
    v_permissions := v_permissions || array[
      'clinical:read','clinical:write','clinical:sign',
      'patient:read','patient:write','ai:invoke'
    ];
  end if;
  if 'nurse' = any(v_roles) then
    v_permissions := v_permissions || array[
      'clinical:read','clinical:write','patient:read','patient:write','ai:invoke'
    ];
  end if;
  if 'billing' = any(v_roles) then
    v_permissions := v_permissions || array['billing:read','billing:write','patient:read'];
  end if;
  if 'scheduler' = any(v_roles) then
    v_permissions := v_permissions || array['patient:read','patient:write'];
  end if;
  if 'patient' = any(v_roles) then
    v_permissions := v_permissions || array['patient:read'];
  end if;
  if 'read_only' = any(v_roles) then
    v_permissions := v_permissions || array['clinical:read','patient:read','billing:read'];
  end if;

  return p_permission = any(v_permissions);
end;
$$;

-- ---------- RLS --------------------------------------------------------------

alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.tenant_members   enable row level security;
alter table public.invitations      enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (id in (select public.current_user_tenant_ids()));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update to authenticated
  using (id in (select public.current_user_tenant_ids()) and public.has_permission('admin:tenant', id))
  with check (id in (select public.current_user_tenant_ids()) and public.has_permission('admin:tenant', id));

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select tm.user_id from public.tenant_members tm
      where tm.tenant_id in (select public.current_user_tenant_ids())
        and tm.deleted_at is null
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id in (select public.current_user_tenant_ids())
  );

-- Split write policies to avoid overlap with SELECT (Supabase perf advisor).
drop policy if exists tenant_members_write on public.tenant_members;
create policy tenant_members_insert on public.tenant_members
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));
create policy tenant_members_update on public.tenant_members
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));
create policy tenant_members_delete on public.tenant_members
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));

drop policy if exists invitations_rw on public.invitations;
create policy invitations_rw on public.invitations
  for all to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));

-- Audit RLS (table lives in audit schema, created in 0001).

drop policy if exists audit_read on audit.audit_events;
create policy audit_read on audit.audit_events
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (select public.has_permission('admin:tenant', tenant_id))
  );

drop policy if exists audit_insert_self on audit.audit_events;
create policy audit_insert_self on audit.audit_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and tenant_id in (select public.current_user_tenant_ids())
  );

-- Audit triggers on tenancy tables.

drop trigger if exists tenants_audit on public.tenants;
create trigger tenants_audit
  after insert or update or delete on public.tenants
  for each row execute function audit.log_change();

drop trigger if exists tenant_members_audit on public.tenant_members;
create trigger tenant_members_audit
  after insert or update or delete on public.tenant_members
  for each row execute function audit.log_change();

drop trigger if exists invitations_audit on public.invitations;
create trigger invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function audit.log_change();
