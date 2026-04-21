# UC-B5 — Slot-conflict detection on appointment create

> **Status:** Draft · **Group:** B (visit lifecycle) · **Priority:** demo-critical

## Actors

- _Primary:_ Scheduler (role `scheduler`), Front Desk
- _Secondary:_ Office Admin (role `office_admin`), Practice Owner (role `practice_owner`)

## Preconditions

- Caller holds `schedule:write` (scheduler, office_admin, practice_owner).
- Selected provider is a member of the caller's tenant (already filtered via the `tenant_members`
  query in `apps/web/src/app/(app)/appointments/new/page.tsx`).
- `public.appointments` has existing rows for that provider/day (otherwise there is nothing to
  conflict with and the flow becomes a direct insert).

## Trigger

User submits the **New appointment** form at `/appointments/new`. Today `createAppointment` inserts
without any pre-check and relies on the Postgres exclusion constraint `appointments_no_overlap` (see
`supabase/migrations/20260416000006_scheduling_inventory.sql:135-140`) to reject overlaps. The user
sees the raw DB error "conflicting key value violates exclusion constraint …" — this spec replaces
that with a proactive, actionable UX.

## Main Flow

1. User selects provider, **location**, date, start time, and duration (or picks a patient via the
   incoming `patient_id` query param).
2. On blur of the time or duration input, the client emits a
   `GET /api/appointments/busy-time?provider_id=:id&location_id=:id&from=:iso&to=:iso` request (NEW
   — proposed) that returns **two sets**:
   - `provider_busy` — rows for that provider on that day across all locations (provider can't be in
     two places)
   - `location_busy` — rows for that location on that day (room / exam-chair contention;
     multi-location practices have finite rooms per site) Both sets filter
     `status not in ('cancelled','no_show','rescheduled')`.
3. Client overlays both sets on a compact "day strip" visual, distinguishing provider-conflicts
   (red) from location-conflicts (amber). If the user's proposed window overlaps any row, an inline
   message renders: "This overlaps Dr. Jane Lee's 10:00–10:30 appointment at Midtown" (provider
   conflict) or "Midtown is fully booked 10:00–10:30 — Dr. Lee with another patient" (location
   conflict). The **Book appointment** button is disabled while a provider-conflict exists;
   location-conflict shows a warning but allows override by an `office_admin` or `practice_owner`
   (passing `allow_overbook=true`).
4. User adjusts provider, location, start time, or duration until no blocking conflict remains.
5. User clicks **Book appointment**. Server action `createAppointment`: a. Re-checks
   `schedule:write`. b. Runs the same busy-time queries server-side (provider + location;
   belt-and-braces — never trust client). c. If a provider-level conflict exists, redirects back to
   `/appointments/new?error=…&conflict_start=…&conflict_end=…&conflict_kind=provider` with the
   conflict pre-expanded. Location conflicts are logged as warnings but do not block unless
   `allow_overbook=false`. d. If no blocking conflicts, inserts into `public.appointments`. The DB
   exclusion constraint remains as the authoritative backstop for the narrow race window between
   step 5b and 5d.
6. On successful insert, redirect to `/appointments/:id`.

## Alternate Flows

### A1. Race condition — conflict appears between client check and server insert

1. _At step 5d_ the Postgres exclusion constraint `appointments_no_overlap` fires because another
   scheduler booked the same provider in the intervening milliseconds.
2. Server action catches the constraint violation (`SQLSTATE 23P01`), re-runs the busy-time query to
   get the current state, and redirects to `/appointments/new?error=conflict&...` with a message
   naming the newly-present conflict. The user sees the same proactive UI, never the raw DB error.

### A2. Cancelled / no-show appointments do not count

1. Busy-time query filters `status not in ('cancelled','no_show','rescheduled')` — matches the
   exclusion constraint's `where` clause exactly so UI and DB agree.

### A3. Back-to-back is allowed

1. The exclusion constraint uses `tstzrange(start_at, end_at, '[)')` (half-open interval). An
   appointment ending at 10:00 does not conflict with one starting at 10:00. The UI reflects this: a
   proposed 10:00–10:30 on top of an existing 09:30–10:00 is green.

### A4. Provider has no existing appointments that day

1. Busy-time query returns empty; no visual overlay; any time slot is valid; insert proceeds.

### A5. Provider changed after conflicts were computed

1. Changing the provider select re-fires the busy-time query with the new `provider_id`. Previous
   conflicts are cleared; new conflicts (if any) render.

## Postconditions

- A new row exists in `public.appointments` with non-conflicting `[start_at, end_at)` for the chosen
  `provider_id`, or no row exists and the user is still on the form with a conflict message.
- The DB-level exclusion constraint `appointments_no_overlap` remains the authoritative invariant;
  this UC only adds a friendlier UX layer above it.

## Business Rules

- **BR-1.** The client-side busy-time check is advisory only. The server MUST re-query and the DB
  constraint MUST remain in place — trust boundary is the database.
- **BR-2.** Busy-time window MUST filter the same set of statuses as the exclusion constraint:
  `not in ('cancelled','no_show','rescheduled')`. Adding or removing a status in one place requires
  the other.
- **BR-3.** Tenant isolation: busy-time query filters on `tenant_id = session.tenantId`.
  Cross-tenant appointments are invisible (they cannot conflict anyway — the exclusion is
  per-provider-id, which is scoped to one tenant's staff).
- **BR-4.** The endpoint `/api/appointments/busy-time` returns only the fields the UI needs: `id`,
  `start_at`, `end_at`, `status`, and a coarse provider display name. It does NOT leak patient name
  or reason to schedulers who might not have `patient:read` for some reason (defense in depth —
  scheduler has `patient:read` today, but this keeps the endpoint minimal).
- **BR-5.** Permission `schedule:write` is enforced at the form action AND at the busy-time endpoint
  handler.
- **BR-6.** Location-level contention (same `location_id` + overlapping time + different
  `provider_id`) is detected and surfaced but is NOT a hard block — demo-day reality is that rooms
  can be shared, procedures can co-locate, and a front-desk override belongs to the admins.
  Provider-level contention remains a hard block (the DB exclusion constraint is on `provider_id`
  alone, which prevents the obvious "same doctor in two places" failure).
- **BR-7.** Multi-location support: the provider select and location select are independent. A
  provider with staff_schedules at multiple locations must be bookable at any of them on the same
  day without the UI forcing a single home site.

## Exceptions

| Code           | When it happens                                                        | User-facing message                                                  |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `E_PERMISSION` | Caller lacks `schedule:write`                                          | "You don't have access to book appointments."                        |
| `E_VALIDATION` | Missing provider / date / start time, or `end_at <= start_at`          | Field-level error                                                    |
| `E_CONFLICT`   | Server-side busy-time query or DB exclusion constraint reports overlap | "This overlaps {provider_name}'s appointment from {start} to {end}." |
| `E_DB`         | Any other insert failure (e.g., FK on provider)                        | "Couldn't book — please try again."                                  |

## Data Model Touchpoints

| Table                                                                                                | Writes                                                                                                             | Reads                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.appointments` (existing — `supabase/migrations/20260416000006_scheduling_inventory.sql:100`) | `tenant_id`, `patient_id`, `provider_id`, `location_id`, `start_at`, `end_at`, `reason`, `visit_type`, `booked_by` | `id`, `provider_id`, `start_at`, `end_at`, `status` — filtered on `tenant_id`, `provider_id`, and the target date range. Uses index `appointments_provider_start_idx`. |
| `public.profiles`                                                                                    | —                                                                                                                  | `id`, `full_name`, `email` — to render "Dr. Jane Lee" in the conflict message                                                                                          |
| Exclusion constraint `appointments_no_overlap`                                                       | Enforced by DB                                                                                                     | —                                                                                                                                                                      |

## Permissions Required

| Permission       | Enforced where                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule:write` | Page `/appointments/new` (server component gate), server action `createAppointment` (existing `requirePermission` call), new `/api/appointments/busy-time` handler, RLS `appointments` `with check` policy |
| `patient:read`   | RLS `appointments` select policy (`has_permission('patient:read', tenant_id)`) — scheduler has this                                                                                                        |

## UX Surface

- **Route (form):** `/appointments/new` — `apps/web/src/app/(app)/appointments/new/page.tsx`
- **New API:** `GET /api/appointments/busy-time?provider_id=&from=&to=` (NEW — proposed at
  `apps/web/src/app/api/appointments/busy-time/route.ts`)
- **Server action:** `createAppointment` (existing) extended with a server-side conflict pre-check.
- **Audit event:** existing `appointments_audit` trigger on insert; no new audit wiring. The
  conflict message does NOT emit an audit event (the insert never happens).

## Test Plan

- **Happy path:** `uc-b5-slot-conflict-detection › books appointment when provider has no conflicts`
  — navigate to `/appointments/new`, fill form, expect redirect to `/appointments/:id`.
- **Alt path (conflict detected client-side):**
  `uc-b5 › highlights conflicting slot and disables submit` — seed an appointment for provider X at
  10:00–10:30, pick 10:15 start + 30 min duration, expect red highlight + disabled button.
- **Alt path (conflict detected server-side despite clean client):**
  `uc-b5 › server-side recheck catches race-condition conflict` — stub client check to pass, seed a
  conflicting row via DB, submit, expect error redirect with conflict payload.
- **Alt A2 (cancelled ignored):** `uc-b5 › cancelled appointments do not count as conflicts` — seed
  a `status='cancelled'` row, expect clean booking over the same window.
- **Alt A3 (back-to-back):** `uc-b5 › allows 10:00-10:30 after a 09:30-10:00 existing appointment`.
- **Negative (permission):** `uc-b5 › session without schedule:write cannot load the form`.

## Open Questions

- **OQ-1.** Should the day-strip visual show only the selected provider, or the whole clinic
  (multi-provider resource view)? Multi-provider is more useful for front-desk rebooking but doubles
  the query cost and the UI complexity. Defaulting to single-provider for V1 but confirm.
- **OQ-2.** Should the conflict message reveal the other patient's name to the scheduler? Today,
  scheduler has `patient:read` so it is not a hard permission issue, but showing "Jane Doe, 10:00"
  might be more PHI than needed when all we need is "Dr. Lee booked 10:00–10:30". Recommend: show
  only provider + window, not patient — confirm with product before implementation.
- **OQ-3.** The current form submits `start_time` as UTC regardless of local time (`new Date(...Z)`
  in `createAppointment`). The conflict check inherits this bug — should UC-B5 fix the tz handling
  as well (it's arguably in-scope since conflict detection is wrong across DST boundaries), or
  should we note it and file UC-B5b? Current recommendation: note it, file separately.
