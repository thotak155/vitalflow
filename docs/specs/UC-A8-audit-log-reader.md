# UC-A8 — Admin reads audit events

> **Status:** Draft · **Group:** A (governance) · **Priority:** demo-critical

## Actors

- _Primary:_ Practice Owner or Office Admin (authenticated staff, `audit:read` permission).
- _Secondary:_ Compliance reviewers (read-only; same `audit:read` permission, possibly a future
  `read_only` equivalent role — not yet modelled for staff).

## Preconditions

- Caller is signed in with an active `public.tenant_members` row whose `roles` grant `audit:read`.
  Per `packages/auth/src/rbac.ts`, this is `practice_owner` and `office_admin`.
- `audit.audit_events` RLS policy `audit_read` (see
  `supabase/migrations/20260416000002_tenancy_auth_audit.sql:322-328`) currently gates on
  `public.has_permission('admin:tenant', tenant_id)`. Either (a) broaden the RLS policy to
  `audit:read`, or (b) keep the stricter `admin:tenant` check and rely on the same roles matching
  both. Design choice → see Open Questions.

## Trigger

Caller navigates to `/admin/security` and lands on the "Audit log" panel (today this route renders a
`ComingSoon` stub — it becomes a real page).

## Main Flow

1. Page `/admin/security` resolves the session via `getSession()`, requires `audit:read` via
   `requirePermission(session, "audit:read")`.
2. Parse query params: `actor_id?`, `action?` (one of `INSERT` | `UPDATE` | `DELETE` or an
   `event_type` category — see OQ-2), `target_table?`, `from?` (ISO timestamp), `to?` (ISO
   timestamp), `cursor?` (opaque), `limit?` (default 50, max 200).
3. Query `audit.audit_events` via the server Supabase client (RLS-scoped), filtering by the optional
   predicates above and by `tenant_id` (implicitly via RLS), ordered by `occurred_at DESC, id DESC`.
   Use keyset pagination on `(occurred_at, id)` rather than OFFSET for stable paging over a log that
   grows during viewing.
4. Join / enrich the result in the page layer (not SQL): resolve `actor_id` →
   `public.profiles.full_name` + `email` for display. Missing actor (system event) renders as
   "System".
5. Render a filterable table with columns: Occurred, Actor, Action, Table, Row id, Impersonator (if
   set), Request id. A row click opens a side-sheet with the full `before` / `after` JSON diff.
6. Export button enqueues an `admin.audit_exported` APP event (logged via `logEvent()`) and
   initiates a CSV download of the filtered set (capped at 10k rows or a time window — see OQ-3).

## Alternate Flows

### A1. Impersonated caller

1. At step 1, `permissionsFor(roles, { impersonating: true })` strips `admin:users` but NOT
   `audit:read`. Impersonators can read the log.
2. However, writes triggered by an impersonator are marked with `impersonator_id` in
   `audit.audit_events` (see `20260416000014_rbac_redesign.sql:514-570`). The UI MUST surface this
   column so auditors can distinguish impersonated activity.

### A2. Filter yields no results

1. Table renders an empty state "No audit events match these filters" with a "Clear filters" action.

### A3. Permission revoked mid-session

1. Caller loads the page, then an owner removes their `office_admin` role.
2. On the next fetch, RLS returns zero rows and/or the server action throws `forbidden()` via
   `requirePermission()` → redirect to `/admin` with an error toast.

### A4. Cross-tenant event spillover attempt

1. Caller edits the URL to include a `tenant_id=<other>` query param.
2. RLS still filters by `current_user_tenant_ids()`; the parameter is ignored server-side. Log no
   error, just return the caller's own tenant.

## Postconditions

- **No writes** on the main flow — this is a read-only surface. The only write is when the export
  button fires the `admin.audit_exported` APP event.
- Query latency ≤ 500ms p95 on tenants with ≤ 1M audit rows (covered by
  `audit_events_tenant_time_idx`).

## Business Rules

- **BR-1.** Readers see only their tenant's rows. `audit.audit_events` RLS SELECT policy enforces
  `tenant_id in (select public.current_user_tenant_ids())`.
- **BR-2.** The log is append-only.
  `revoke update, delete on audit.audit_events from authenticated, anon, service_role` (see
  `supabase/migrations/20260416000001_extensions_and_helpers.sql:59`). No UI edit / delete / redact
  actions.
- **BR-3.** PHI is NOT rendered in the primary table view. The `before` / `after` JSON blobs in the
  side-sheet may contain patient columns (e.g. first name on a `patients` UPDATE); that sheet is
  gated behind an explicit "Show full row" affordance to reduce over-the-shoulder disclosure.
- **BR-4.** The "Export" action writes an `admin.audit_exported` event to the log it is reading —
  reviewers can see who exported what and when.
- **BR-5.** Impersonator column is always shown when non-null. Do not hide / collapse it by default.
- **BR-6.** The existing `audit_read` RLS policy gates on `admin:tenant`. This UC advertises
  `audit:read` as the page-level gate — implementation MUST patch the RLS policy in the same
  migration so a future `audit_viewer` role (having `audit:read` but not `admin:tenant`) is not
  silently blocked.

## Exceptions

| Code           | When it happens                                                         | User-facing message                                        |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `E_PERMISSION` | Caller lacks `audit:read`                                               | 403 page, or redirect to `/admin` with "Access restricted" |
| `E_VALIDATION` | Invalid timestamp range (`from > to`), invalid UUID in `actor_id`, etc. | Field-level filter error                                   |
| `E_TOO_LARGE`  | Requested export exceeds row cap (10k) or time window (30 days — TBD)   | "Narrow your filters or export in chunks."                 |

## Data Model Touchpoints

| Table                   | Writes                                                                      | Reads                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audit.audit_events`    | INSERT `event_type = 'admin.audit_exported'` via `logEvent()` (export only) | SELECT `id`, `occurred_at`, `tenant_id`, `actor_id`, `impersonator_id`, `request_id`, `event_type`, `table_schema`, `table_name`, `row_id`, `action`, `before`, `after`, `details`, `ip`, `user_agent` |
| `public.profiles`       | —                                                                           | SELECT `id`, `full_name`, `email` joined on `actor_id` and `impersonator_id`                                                                                                                           |
| `public.tenant_members` | —                                                                           | Indirectly via `public.current_user_tenant_ids()` inside RLS                                                                                                                                           |

_Schema note:_ `event_type text NULL`, `details jsonb NOT NULL DEFAULT '{}'`, and `action = 'APP'`
support were added in `supabase/migrations/20260421000008_audit_events_app_columns.sql`, along with
the supporting indexes `audit_events_tenant_time_idx` and `audit_events_event_type_idx`. APP-level
semantic filtering is live.

## Permissions Required

| Permission   | Enforced where                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit:read` | (a) server page via `requirePermission(session, "audit:read")`; (b) RLS on `audit.audit_events` — **today the policy checks `admin:tenant`**; must be aligned (see OQ below). |

_Defined in `packages/auth/src/rbac.ts` for `practice_owner` (line 40) and `office_admin` (line 58).
Not present in the Postgres-side `has_permission()` as of migration
`20260416000014_rbac_redesign.sql` — the SQL catalog lists `audit:read` for `practice_owner` and
`office_admin` (see lines 422, 431), so the SQL + TS mirror is already in sync for this permission._

## UX Surface

- **Route:** `/admin/security` (today a `ComingSoon` stub — this UC replaces the stub with the real
  page). Breadcrumb `Admin > Security`.
- **Server action:** no mutations except `exportAudit(formData)` which streams a CSV and logs
  `admin.audit_exported`.
- **Audit event:** `admin.audit_exported` on export (no event on read).
- **Table shape:** `apps/web/src/app/(app)/admin/security/page.tsx` renders a paginated `<Table>`
  from `@vitalflow/ui`; filter form at the top, side-sheet for row inspection.

## Test Plan

- **Happy path
  (`uc-a8-audit-log-reader.spec.ts › should list recent audit events for the current tenant`):**
  sign in as `practice_owner`; seed a known INSERT on `public.tenant_members`; visit
  `/admin/security`; assert the row appears in the audit table.
- **Alt A1 (`uc-a8-audit-log-reader.spec.ts › should show impersonator column when set`):** seed an
  audit row with `impersonator_id != null`; assert the impersonator name renders.
- **Filters (`uc-a8-audit-log-reader.spec.ts › should filter by table and date range`):** seed 3
  rows (`public.invitations`, `public.tenant_members`, `public.tenant_members`); filter
  `target_table = tenant_members`; assert only 2 rows render.
- **Permission refusal
  (`uc-a8-audit-log-reader.spec.ts › should 403 for users without audit:read`):** sign in as
  `physician`; visit `/admin/security`; assert 403 or redirect to `/admin`.
- **Export (`uc-a8-audit-log-reader.spec.ts › should log admin.audit_exported on CSV download`):**
  click export; assert a new APP-level audit event `admin.audit_exported` appears within 1s.

## Open Questions

- **OQ-1.** Filter UX: both `action` (INSERT/UPDATE/DELETE/APP) and `event_type` (semantic taxonomy
  from `AUDIT_EVENT_TYPES`) are filterable today. Do we expose both as separate filters, or collapse
  to one "Event type or action" picker that understands both vocabularies? Recommend: separate
  dropdowns — "Category" (action) and "Event" (event_type, populated from the enum).
- **OQ-2.** Export caps: CSV export row limit (proposed 10k) and time-window limit (proposed 30
  days). For a large tenant, a full-year export could stream millions of rows. Confirm limits or
  switch to background-job exports (write to `scribe-raw`-style bucket, email when ready).
- **OQ-3.** Should `before` / `after` JSON previews in the side-sheet be redacted by the server
  (e.g., replace SSN / DOB with `***`), or rely on the PHI guard already enforced on `details` + the
  audit-read role's existing HIPAA access? The current schema stores raw row JSON in `before` /
  `after`, so the column naturally contains PHI for clinical tables.
