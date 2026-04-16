-- =============================================================================
-- 0010 — Platform: notifications, integrations, webhooks, feature flags
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------

do $$ begin
  create type public.notification_channel as enum ('email','sms','push','in_app');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_status as enum (
    'queued','sending','sent','delivered','bounced','failed','suppressed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.integration_type as enum (
    'fhir','hl7','stripe','twilio','resend','posthog','sentry','generic_webhook','oauth_smart'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.integration_status as enum ('active','disabled','error','expired');
exception when duplicate_object then null; end $$;

-- ---------- Notifications ---------------------------------------------------

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  recipient_id    uuid references auth.users(id) on delete set null,
  recipient_email citext,
  recipient_phone text,
  channel         public.notification_channel not null,
  status          public.notification_status not null default 'queued',
  template_key    text,
  subject         text,
  body_text       text,
  body_html       text,
  template_data   jsonb not null default '{}'::jsonb,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  failed_at       timestamptz,
  provider        text,        -- 'resend','twilio','push_fcm'
  provider_ref    text,
  attempts        smallint not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

create index if not exists notifications_queue_idx
  on public.notifications (tenant_id, status, scheduled_for)
  where status in ('queued','sending');
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (recipient_id = auth.uid() or public.has_permission('admin:tenant', tenant_id))
  );

-- Writes happen via service_role (notification-service).
revoke insert, update, delete on public.notifications from authenticated, anon;

-- ---------- Notification preferences ----------------------------------------

create table if not exists public.notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  channel    public.notification_channel not null,
  category   text not null,      -- 'appointment_reminder','billing','ai_review','marketing',...
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, channel, category)
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create index if not exists notification_prefs_user_idx
  on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_prefs_rw on public.notification_preferences;
create policy notification_prefs_rw on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- Integration connections -----------------------------------------

create table if not exists public.integration_connections (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  type          public.integration_type not null,
  display_name  text not null,
  status        public.integration_status not null default 'active',
  external_id   text,              -- customer id, workspace id, etc.
  config        jsonb not null default '{}'::jsonb,
  -- Secrets are NOT stored here. Use Supabase Vault or external secret mgr;
  -- this column holds only the reference (e.g. vault secret id).
  secret_ref    text,
  last_synced_at timestamptz,
  last_error    text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, type, display_name)
);

drop trigger if exists integration_connections_set_updated_at on public.integration_connections;
create trigger integration_connections_set_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

create index if not exists integration_connections_tenant_type_idx
  on public.integration_connections (tenant_id, type, status);

alter table public.integration_connections enable row level security;

drop policy if exists integration_connections_select on public.integration_connections;
create policy integration_connections_select on public.integration_connections
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  );

drop policy if exists integration_connections_write on public.integration_connections;
create policy integration_connections_write on public.integration_connections
  for all to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  )
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  );

drop trigger if exists integration_connections_audit on public.integration_connections;
create trigger integration_connections_audit
  after insert or update or delete on public.integration_connections
  for each row execute function audit.log_change();

-- ---------- Webhook deliveries ----------------------------------------------

create table if not exists public.webhook_deliveries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references public.tenants(id) on delete set null,
  connection_id  uuid references public.integration_connections(id) on delete set null,
  direction      text not null check (direction in ('inbound','outbound')),
  provider       text not null,
  event_type     text not null,
  external_id    text,
  http_status    smallint,
  request_body   jsonb,
  response_body  jsonb,
  signature      text,
  verified       boolean not null default false,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  error_message  text
);

create index if not exists webhook_deliveries_tenant_time_idx
  on public.webhook_deliveries (tenant_id, received_at desc);
create index if not exists webhook_deliveries_provider_idx
  on public.webhook_deliveries (provider, event_type, received_at desc);
create index if not exists webhook_deliveries_connection_idx
  on public.webhook_deliveries (connection_id);

alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and public.has_permission('admin:tenant', tenant_id)
  );

-- Webhooks are written by backend only.
revoke insert, update, delete on public.webhook_deliveries from authenticated, anon;

-- ---------- Feature flags ----------------------------------------------------

create table if not exists public.feature_flags (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  description  text,
  default_enabled boolean not null default false,
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- No tenant_id: flags are global by default.
-- Readable by any authenticated user; writes are service_role only.
alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags
  for select to authenticated using (true);

revoke insert, update, delete on public.feature_flags from authenticated, anon;

-- ---------- Feature flag overrides ------------------------------------------

create table if not exists public.feature_flag_overrides (
  id         uuid primary key default gen_random_uuid(),
  flag_id    uuid not null references public.feature_flags(id) on delete cascade,
  tenant_id  uuid references public.tenants(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  enabled    boolean not null,
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tenant_id is not null or user_id is not null)
);

drop trigger if exists feature_flag_overrides_set_updated_at on public.feature_flag_overrides;
create trigger feature_flag_overrides_set_updated_at
  before update on public.feature_flag_overrides
  for each row execute function public.set_updated_at();

create unique index if not exists feature_flag_overrides_tenant_unique
  on public.feature_flag_overrides (flag_id, tenant_id)
  where tenant_id is not null and user_id is null;
create unique index if not exists feature_flag_overrides_user_unique
  on public.feature_flag_overrides (flag_id, user_id)
  where user_id is not null and tenant_id is null;
create unique index if not exists feature_flag_overrides_tenant_user_unique
  on public.feature_flag_overrides (flag_id, tenant_id, user_id)
  where tenant_id is not null and user_id is not null;

alter table public.feature_flag_overrides enable row level security;

drop policy if exists feature_flag_overrides_select on public.feature_flag_overrides;
create policy feature_flag_overrides_select on public.feature_flag_overrides
  for select to authenticated
  using (
    user_id = auth.uid()
    or (tenant_id is not null and tenant_id in (select public.current_user_tenant_ids()))
  );

revoke insert, update, delete on public.feature_flag_overrides from authenticated, anon;
