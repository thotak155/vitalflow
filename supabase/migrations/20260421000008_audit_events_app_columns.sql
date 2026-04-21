-- Reconcile audit.audit_events schema with the app-level logEvent() helper
-- in packages/auth/src/audit.ts.
--
-- The table was designed for row-level trigger events only (INSERT / UPDATE /
-- DELETE with before/after jsonb snapshots). But the app helper writes
-- `event_type` (semantic event name), `details` (event-specific jsonb), and
-- an `action = 'APP'` value. None of those were valid, so every semantic
-- audit call (note.signed, ai.draft_accepted, impersonation.started,
-- claim.submitted, ...) threw silently — fire-and-forget callers ate the
-- error via logEventBestEffort(), non-best-effort callers propagated it.
--
-- Fix: extend the schema so both trigger-written rows and app-written rows
-- fit.

alter table audit.audit_events
  add column if not exists event_type text,
  add column if not exists details jsonb not null default '{}'::jsonb;

-- Non-targeted APP events don't carry a specific row.
alter table audit.audit_events
  alter column table_schema drop not null,
  alter column table_name drop not null;

-- Widen the action check so APP is legal.
alter table audit.audit_events
  drop constraint if exists audit_events_action_check;
alter table audit.audit_events
  add constraint audit_events_action_check
  check (action = any (array['INSERT'::text, 'UPDATE'::text, 'DELETE'::text, 'APP'::text]));

-- Invariant: APP events MUST set event_type; row-level events MAY leave it
-- null (the trigger doesn't know semantic intent).
alter table audit.audit_events
  add constraint audit_events_app_needs_event_type
  check (action <> 'APP' or event_type is not null);

-- Indexes supporting the /admin/security audit log reader (UC-A8): filter by
-- tenant + time, and by event_type lookup for "show me every note.signed".
create index if not exists audit_events_tenant_time_idx
  on audit.audit_events (tenant_id, occurred_at desc);

create index if not exists audit_events_event_type_idx
  on audit.audit_events (tenant_id, event_type, occurred_at desc)
  where event_type is not null;

notify pgrst, 'reload schema';
