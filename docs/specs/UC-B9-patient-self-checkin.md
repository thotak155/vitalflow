# UC-B9 — Patient self-checks in for visit

> **Status:** Draft · **Group:** B (visit lifecycle) · **Priority:** demo-nice-to-have

## Actors

- _Primary:_ Patient (user_kind `patient`, holds `self:read`, `self:write`)
- _Secondary:_ Provider (receives an inbox notification), Front Desk (sees arrival in the day's
  appointment board)

## Preconditions

- Patient has a verified `public.patient_portal_links` row for the tenant that owns the appointment.
- The appointment is in `public.appointments` with `status in ('scheduled','confirmed')` and
  `start_at` within a configurable early-check-in window (default: not more than 60 minutes before
  `start_at`; implementation detail — see Open Questions).
- Today `/my/appointments` is a `ComingSoon` stub
  (`apps/web/src/app/(app)/my/appointments/page.tsx`). This UC brings the route live and adds
  `/my/appointments/[id]/check-in`.

## Trigger

- Patient taps **Check in** on `/my/appointments` (list) or opens the check-in link from a reminder
  push / SMS.
- Lands on `/my/appointments/[id]/check-in`.

## Main Flow

1. Patient opens `/my/appointments/[id]/check-in`.
2. Page guard (server component): a. Requires session; otherwise redirect to `/login?next=…`. b.
   Confirms the caller is linked via `public.patient_portal_links` to the appointment's `patient_id`
   AND that `appointments.tenant_id` matches the link's tenant. c. Confirms
   `appointments.status in ('scheduled','confirmed')` and `now() <= start_at + interval '15 min'`
   (late-arrival cutoff — configurable).
3. Page renders:
   - Visit summary: date/time, provider name, location, visit_type.
   - Identity confirmation: DOB prompt ("Please confirm your date of birth"). On mismatch, block
     check-in and surface "Your details don't match — please see the front desk."
   - Intake form status chip (from UC-B8 if present) — "Intake submitted" / "Intake still needed"
     with a link to `/my/intake/[id]`.
   - Balance tile (read-only, from `public.patient_balances`) — "You have a $25 balance. Please
     bring payment or pay online."
   - **I'm here** button.
4. Patient clicks **I'm here**. Server action `selfCheckIn({ appointmentId, confirmedDob })`: a.
   Re-runs the identity + tenant + state checks. b. Updates `public.appointments` SET
   `status = 'arrived'`, `arrived_at = now()` (**NEW — proposed column** `arrived_at timestamptz` on
   `public.appointments`). c. Inserts a `public.notifications` row for the provider:
   `channel='in_app'`, `template_key='patient_arrived'`,
   `template_data={appointment_id, patient_id, arrived_at}`,
   `recipient_id = appointments.provider_id`. d. Inserts a parallel `notifications` row for the
   front-desk inbox (group inbox — see OQ-2).
5. Patient sees a confirmation: "You're checked in. Please have a seat — your provider will be
   notified."
6. Provider sees an inbox badge increment on the next `/inbox` poll or push.

## Alternate Flows

### A1. Patient is too early

1. _At step 2c_ `now() < start_at - interval '60 min'`.
2. Page shows: "Check-in opens at {start_at - 60 min}. Come back then." — no button.

### A2. Patient is too late

1. _At step 2c_ `now() > start_at + interval '15 min'`.
2. Page shows: "This visit can't be self-checked-in — please see the front desk." — no button. The
   appointment remains `scheduled`; front desk handles in person.

### A3. DOB mismatch (identity fail)

1. _At step 3_ the DOB entered doesn't match `patients.date_of_birth`.
2. The action is blocked; a rate-limit counter in `metadata` (or a `public.security_events` row if
   we extend that table) tracks attempts; after 3 failed attempts in 10 minutes the check-in link is
   disabled and the patient is told to see the front desk.

### A4. Appointment already `arrived` / `in_progress` / `completed`

1. _At step 2c_ the status check fails.
2. Page shows: "You're already checked in." (idempotent) and links to `/my/appointments`.

### A5. Cancelled / no-show

1. Page shows a read-only message; no action available.

## Postconditions

- `public.appointments.status = 'arrived'` and `public.appointments.arrived_at = <timestamp>` for
  the target appointment.
- Two `public.notifications` rows exist: one for provider, one for front desk.
- `appointments_audit` fires via the existing `audit.log_change()` trigger, capturing the status
  transition.

## Business Rules

- **BR-1.** Tenant + patient isolation: `appointment_id`'s `tenant_id` MUST be in
  `public.current_user_tenant_ids()` AND its `patient_id` MUST be in
  `public.current_user_patient_ids(tenant_id)`. RLS on `appointments` already requires
  `patient:read`; for patient writes we rely on the server action to use a `SECURITY DEFINER` RPC
  (proposed `public.self_check_in(p_appointment_id uuid)`) OR a new RLS write policy gated on
  `self:write` + portal link membership.
- **BR-2.** The status transition is write-once from this action: `self_check_in` only flips
  `scheduled` or `confirmed` → `arrived`. Any other prior state is rejected (see A4).
- **BR-3.** Identity verification (DOB) is required. For V1 this is a simple compare; step-up auth
  (e.g., a one-time code sent to the patient's on-file phone) is a later hardening.
- **BR-4.** Time window is tenant-configurable via tenant settings (future work); hard-coded to ±60
  min / +15 min for V1.
- **BR-5.** Notifications MUST be best-effort — a failure to insert the provider notification MUST
  NOT roll back the check-in. We wrap the check-in update and notification inserts in the same
  transaction but swallow notification errors with a log breadcrumb.
- **BR-6.** Multi-location practices: the check-in page MUST display the appointment's `location_id`
  (name + address) prominently before the patient confirms — a 3-location practice sees patients
  showing up at the wrong site routinely, and silent-accept is worse than "this visit is at Midtown;
  are you there?" Confirmation requires an explicit "Yes, I'm at {location_name}" click.
- **BR-7.** Surface gating: the `/my/appointments/:id/check-in` route is gated on
  `session.userKind === 'patient'`. Staff users hitting the route 404 — staff check patients in via
  `/appointments/:id` (existing).

## Exceptions

| Code           | When it happens                                | User-facing message                                              |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `E_PERMISSION` | User isn't linked to the appointment's patient | 404 "We couldn't find that appointment."                         |
| `E_IDENTITY`   | DOB mismatch                                   | "Those details don't match — please see the front desk."         |
| `E_TOO_EARLY`  | now < start_at - 60 min                        | "Check-in opens at {time}."                                      |
| `E_TOO_LATE`   | now > start_at + 15 min                        | "Please see the front desk to check in."                         |
| `E_STATE`      | Appointment is not `scheduled` / `confirmed`   | "You're already checked in." / "This visit is no longer active." |
| `E_RATE_LIMIT` | Too many failed identity attempts              | "Too many attempts — please see the front desk."                 |

## Data Model Touchpoints

| Table                                                                                                 | Writes                                                                                                                                                                     | Reads                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `public.appointments` (existing — `supabase/migrations/20260416000006_scheduling_inventory.sql:100`)  | `status = 'arrived'`, **NEW — proposed** column `arrived_at timestamptz` (null by default)                                                                                 | `id`, `tenant_id`, `patient_id`, `provider_id`, `location_id`, `start_at`, `end_at`, `status`, `visit_type` |
| `public.patient_portal_links` (existing — `supabase/migrations/20260416000014_rbac_redesign.sql:279`) | —                                                                                                                                                                          | `user_id`, `tenant_id`, `patient_id`, `verified_at`                                                         |
| `public.patients`                                                                                     | —                                                                                                                                                                          | `id`, `date_of_birth`, `given_name`, `family_name` for identity + display                                   |
| `public.notifications` (existing — `supabase/migrations/20260416000010_platform.sql:29`)              | Two inserts: one for provider (`recipient_id = provider_id`), one for front-desk inbox group. `channel='in_app'`, `template_key='patient_arrived'`, `template_data jsonb`. | —                                                                                                           |
| `public.patient_balances`                                                                             | —                                                                                                                                                                          | `current_balance_minor`, `currency` for the balance tile (read-only nudge)                                  |

**Schema addition (NEW — proposed):**

```sql
alter table public.appointments
  add column if not exists arrived_at timestamptz;

create index if not exists appointments_tenant_arrived_idx
  on public.appointments (tenant_id, arrived_at desc)
  where arrived_at is not null;
```

**RPC (NEW — proposed, SECURITY DEFINER):**

```
public.self_check_in(p_appointment_id uuid, p_confirmed_dob date)
  returns table (appointment_id uuid, arrived_at timestamptz)
  -- verifies: portal link ∋ (auth.uid(), appointment.tenant, appointment.patient)
  --           dob matches patients.date_of_birth
  --           status in ('scheduled','confirmed') and within window
  -- updates: status='arrived', arrived_at=now()
  -- inserts: notifications for provider + front desk
```

## Permissions Required

| Permission                         | Enforced where                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `self:read`                        | Page `/my/appointments/[id]/check-in` gate; select policy on `appointments` scoped via portal link |
| `self:write`                       | `self_check_in` RPC body (check `has_permission('self:write', tenant_id)`)                         |
| `patient:read` (inbox reader side) | Provider receiving the notification — already has this                                             |

## UX Surface

- **Route:** `/my/appointments/[id]/check-in` — NEW, under
  `apps/web/src/app/(app)/my/appointments/[id]/check-in/page.tsx`
- **Route (list):** `/my/appointments` — replaces the ComingSoon stub at
  `apps/web/src/app/(app)/my/appointments/page.tsx` with a minimal upcoming/past list that links
  into check-in
- **Server action / RPC:** `selfCheckIn` (client server-action wrapper) → `public.self_check_in` (DB
  RPC)
- **Audit event:** existing `appointments_audit` trigger (captures the status change). Notification
  inserts are logged by `audit.log_change()` on `notifications` if that trigger is installed (verify
  — see OQ).

## Test Plan

- **Happy path:** `uc-b9-patient-self-checkin › patient checks in inside the window` — seed an
  appointment 15 min in the future, patient confirms DOB, click **I'm here**, expect
  `status='arrived'` in DB + provider notification row.
- **Alt A1:** `uc-b9 › too-early visit shows countdown, no button`.
- **Alt A2:** `uc-b9 › too-late visit blocks self check-in`.
- **Alt A3:** `uc-b9 › DOB mismatch is rejected and counted`.
- **Alt A4:** `uc-b9 › already-arrived appointment shows idempotent confirmation`.
- **Negative (cross-patient):**
  `uc-b9 › user linked to a different patient_id receives 404 and no row is updated`.

## Open Questions

- **OQ-1.** Is a DOB-only identity check acceptable for self check-in, or do we need step-up auth
  (SMS OTP) for visits flagged as controlled-substance or billing-sensitive? For V1 demo we're going
  with DOB-only; confirm before hardening sprint.
- **OQ-2.** "Front-desk inbox" isn't a modeled concept yet. `public.notifications.recipient_id`
  references `auth.users(id)`. Options: (a) assign front desk a shared service account user, (b) fan
  out to every `office_admin` or `scheduler` member of the tenant, (c) add a `recipient_role text`
  column and let the inbox page filter by role. Needs architectural call before implementation.
- **OQ-3.** The check-in window (`-60 min` / `+15 min`) is hard-coded. Should it be a tenant
  setting? If yes, where — a new JSONB key on `public.tenants`, or a dedicated `tenant_settings`
  table? Flag for product before we multiply hard-coded constants.
- **OQ-4.** Does "checked in" automatically create the `public.encounters` row
  (`class='ambulatory'`, `status='arrived'`) or does the provider still create it manually when they
  walk the patient back? Today the appointment → encounter link is manual (via
  `appointments.encounter_id`). Confirm — small scope change with downstream impact on UC-C3.
- **OQ-5.** Per-location front-desk inbox: OQ-2's "shared service account vs role fan-out vs
  recipient_role column" decision has a multi-location wrinkle — a 3-site practice shouldn't blast a
  check-in alert to every front-desk user across all sites. Favored approach is
  `recipient_role text` + a new `location_id uuid` column on `public.notifications` (or a JSONB
  `routing` metadata key) so the inbox can filter
  `role = 'scheduler' AND location_id = my_location`. Ties back to OQ-2; they MUST resolve together.
