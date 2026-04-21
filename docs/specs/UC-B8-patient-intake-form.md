# UC-B8 — Patient completes pre-visit intake form

> **Status:** Draft · **Group:** B (visit lifecycle) · **Priority:** demo-nice-to-have

## Actors

- _Primary:_ Patient (user_kind `patient`, holds `self:read`, `self:write`)
- _Secondary:_ Front Desk / Scheduler (reads completion status on the appointment detail page)
- _Secondary:_ Office Admin / Practice Owner (authors templates)

## Preconditions

- Patient has a verified `public.patient_portal_links` row (`verified_at is not null`) linking their
  `auth.users.id` to a `public.patients.id` in the tenant.
- The patient has an upcoming appointment
  (`public.appointments.status in ('scheduled','confirmed')`) whose `start_at` is in the future.
- At least one active intake template exists for the tenant (NEW — proposed table
  `public.intake_forms`).

## Trigger

Two entry points:

1. Patient clicks the intake link in an appointment-reminder email / SMS (token-signed URL) → lands
   on `/my/intake/[appointmentId]`.
2. Patient navigates to `/my/appointments` (once UC-B9-adjacent work lands, today a stub) and clicks
   **Complete intake** on an upcoming visit.

## Main Flow

1. Patient opens `/my/intake/[appointmentId]`.
2. Page guard:
   - Requires session; redirects to `/login?next=...` otherwise.
   - Joins `public.patient_portal_links` to `public.appointments` to confirm the appointment belongs
     to a patient this user is linked to (tenant + patient_id match).
   - Resolves the appropriate template via `public.intake_forms` (tenant-scoped, `active=true`,
     optionally filtered by `visit_type`). If multiple match, pick the most recent `effective_at`.
3. Page renders the template's JSONB `schema` as a form (field types: `text`, `textarea`,
   `single_select`, `multi_select`, `date`, `yes_no`, `signature`, `group`). Previously-saved
   partial answers are pre-filled from the latest `public.intake_submissions` row for this
   appointment where `submitted_at is null`.
4. Patient fills fields. Client autosaves every 15 seconds (or on blur) to
   `POST /api/my/intake/:appointmentId/draft` which upserts `public.intake_submissions` with
   `answers` JSONB and `updated_at`.
5. Patient clicks **Submit**. Server action `submitIntake({ appointmentId, answers })`: a. Confirms
   identity (session → portal link → appointment). b. Validates answers against the template's
   `schema` (required fields, enum values, date parses). c. Sets
   `intake_submissions.submitted_at = now()`, freezes the row (subsequent drafts rejected). d.
   Inserts a `public.notifications` row for each of the appointment's care team (provider, and the
   tenant's default front-desk inbox) — `channel='in_app'`, `template_key='intake_submitted'`,
   `template_data={appointment_id, patient_id}`.
6. Patient sees a "Thanks, we'll see you at {appointment_time}" confirmation and a link back to
   `/my/appointments`.

## Alternate Flows

### A1. Patient saves and returns later

1. _At step 4_ patient closes the tab. State is preserved via the autosave.
2. On re-open, the form rehydrates from the saved draft.

### A2. Appointment already started / was cancelled

1. _At step 2_ appointment `status in ('in_progress','completed','cancelled','no_show')`.
2. Page renders a read-only summary instead of an editable form: "This visit is no longer editable.
   Contact the practice for changes." — no submit button.

### A3. No template configured for the tenant

1. _At step 2_ no `intake_forms` row matches.
2. Page renders: "No intake form is required for this visit." — no submit, no submission row
   created.

### A4. Front-desk view

1. Staff opens `/appointments/[id]` (existing `apps/web/src/app/(app)/appointments/[id]/page.tsx`).
2. Appointment detail page queries `public.intake_submissions` by `appointment_id` and renders a
   status chip: **Not started** · **In progress (saved N minutes ago)** · **Submitted (at HH:MM)**.
   Clicking **Submitted** opens a read-only modal with the answers.

### A5. Patient repeats an already-submitted form

1. _At step 2_ a submission with `submitted_at is not null` already exists.
2. Page shows the submitted answers read-only with a "Request to edit" button (out of scope here;
   wires to a messaging flow later).

## Postconditions

- Exactly zero or one `public.intake_submissions` row exists for this `appointment_id` (unique
  constraint enforces this).
- The submission's `submitted_at` is non-null once the patient completes it; `answers` JSONB is
  valid against the template `schema` at submit time.
- Notifications exist for provider + front desk.

## Business Rules

- **BR-1.** Tenant + patient isolation: every read and write verifies
  `appointment_id → patient_id ∈ public.patient_portal_links(user_id = auth.uid())`. This is
  enforced by RLS on `intake_submissions` (proposed:
  `using (public.has_permission('self:read', tenant_id) and patient_id in (select current_user_patient_ids(tenant_id)))`).
- **BR-2.** The `schema` column is authoritative for validation — both on the client (for UX) and on
  the server (for truth). Client validation alone is insufficient.
- **BR-3.** Submission is immutable once `submitted_at` is set. Edits require a new submission or a
  staff-driven amendment workflow (out of scope).
- **BR-4.** PHI: answers may include sensitive content. The table inherits audit via
  `audit.log_change()` trigger (standard pattern). Drafts are kept indefinitely unless the
  appointment is cancelled; a cleanup sweep is deferred.
- **BR-5.** Notifications on submit use the `in_app` channel (inbox). Email/SMS piggyback on the
  existing notifications dispatcher if the provider's preferences call for it.
- **BR-6.** Surface gating: the `/my/intake/:appointmentId` route is gated on
  `session.userKind === 'patient'`. Staff users hitting the route 404 — staff view completed
  submissions via the appointment detail page, never fill one out on a patient's behalf.

## Exceptions

| Code                  | When it happens                                              | User-facing message                                  |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `E_PERMISSION`        | User is not linked to the patient that owns this appointment | 404 "We couldn't find that form for you."            |
| `E_VALIDATION`        | Required field missing, bad enum value, unparseable date     | Inline field-level error                             |
| `E_STATE`             | Appointment is not in a submittable state (see A2)           | "This visit is no longer editable."                  |
| `E_NO_TEMPLATE`       | No active template for the tenant / visit type (see A3)      | "No intake form is required for this visit."         |
| `E_ALREADY_SUBMITTED` | Submission row already has `submitted_at` set                | "You've already submitted this form." (A5 read-only) |

## Data Model Touchpoints

All tables in this UC are **NEW — proposed**. They follow the house pattern (tenant-scoped, soft
delete, updated_at trigger, audit trigger, RLS).

| Table                                 | Writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reads                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `public.intake_forms` **(NEW)**       | Inserted by admin UI (out of scope here). Columns: `id uuid pk`, `tenant_id uuid not null references tenants(id)`, `name text not null`, `description text`, `visit_type text` (null = applies to all), `schema jsonb not null`, `effective_at timestamptz not null default now()`, `active boolean not null default true`, `created_by uuid references auth.users(id)`, `created_at`, `updated_at`, `deleted_at`. Unique `(tenant_id, name, effective_at)`.                                                                               | `id`, `schema`, `name`, `version` (derivable from effective_at) for rendering                      |
| `public.intake_submissions` **(NEW)** | `id uuid pk`, `tenant_id uuid not null`, `appointment_id uuid not null references appointments(id) on delete cascade`, `patient_id uuid not null references patients(id) on delete cascade`, `form_id uuid not null references intake_forms(id) on delete restrict`, `answers jsonb not null default '{}'`, `started_at timestamptz not null default now()`, `submitted_at timestamptz`, `created_by uuid references auth.users(id)`, `created_at`, `updated_at`. **Unique** `(appointment_id)` to enforce one submission per appointment. | All columns, joined into `/appointments/[id]` for staff status chip                                |
| `public.appointments`                 | — (no writes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `id`, `tenant_id`, `patient_id`, `status`, `start_at`, `visit_type` for gate + template resolution |
| `public.patient_portal_links`         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `user_id`, `tenant_id`, `patient_id`, `verified_at` for the identity gate                          |
| `public.notifications`                | One row per care-team recipient on submit (`channel='in_app'`, `template_key='intake_submitted'`, `template_data`)                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                  |

**Index suggestions (NEW):**

- `intake_forms_tenant_active_idx on (tenant_id, active, visit_type)` where `deleted_at is null`
- `intake_submissions_appt_idx on (appointment_id)` — also serves the unique constraint
- `intake_submissions_tenant_submitted_idx on (tenant_id, submitted_at desc)` where
  `submitted_at is not null`

**RLS (NEW — proposed):**

- `intake_forms`: select = `patient:read OR self:read` (staff can see all tenant templates; patient
  can see the one linked to their appointment). Write = `admin:tenant`.
- `intake_submissions`: select = staff with `patient:read` OR patient with `self:read` matching
  `patient_id IN current_user_patient_ids()`. Write/update before submit = same. Insert =
  server-side only via service-role helper for the notification fan-out (or a policy with
  `check self:write and appointment matches`).

## Permissions Required

| Permission     | Enforced where                                                                          |
| -------------- | --------------------------------------------------------------------------------------- |
| `self:read`    | Page `/my/intake/[appointmentId]` gate; RLS `intake_submissions_select` policy          |
| `self:write`   | Server actions `saveIntakeDraft`, `submitIntake`; RLS `intake_submissions_write` policy |
| `patient:read` | Staff view of submission on `/appointments/[id]` detail page (existing permission)      |
| `admin:tenant` | Future template-author UI (out of scope here, flagged in Open Questions)                |

## UX Surface

- **Route (patient):** `/my/intake/[appointmentId]` — NEW, under
  `apps/web/src/app/(app)/my/intake/[appointmentId]/page.tsx`
- **API (draft autosave):** `POST /api/my/intake/:appointmentId/draft` — NEW
- **Route (staff view):** `/appointments/[id]` — EXISTING
  `apps/web/src/app/(app)/appointments/[id]/page.tsx`, extended with the intake status chip +
  read-only modal
- **Server action:** `submitIntake` — NEW, co-located with the patient page
- **Audit event:** `intake_submissions` insert/update via `audit.log_change()` (standard trigger on
  the new table)

## Test Plan

- **Happy path:** `uc-b8-patient-intake-form › patient completes and submits intake form` — navigate
  as patient, fill required fields, submit, expect confirmation + a `public.notifications` row for
  the provider.
- **Alt A1 (autosave):** `uc-b8 › draft autosaves and rehydrates on reload`.
- **Alt A2 (read-only after visit):** `uc-b8 › completed appointment shows read-only form`.
- **Alt A3 (no template):** `uc-b8 › tenant with no template shows the no-op message`.
- **Alt A4 (staff status):**
  `uc-b8 › front desk sees "Submitted" chip on appointment detail after patient submits`.
- **Negative (cross-patient):**
  `uc-b8 › patient linked to a different patient_id cannot open the form and receives 404`.

## Open Questions

- **OQ-1.** Template authoring — this spec assumes a template exists but does NOT specify how it is
  created. Option A: hand-curated seed rows (fine for demo). Option B: a form-builder UI. Option C:
  import from a payer-provided JSON Schema. Needs decision before staff can customize intakes.
- **OQ-2.** Multiple templates per visit type — if a tenant has a "new patient" and a "follow-up"
  template both marked `visit_type='in_person'`, which wins? Current spec says "most recent
  effective_at" but a visit-type + `is_new_patient` matcher might be needed. Flag during
  implementation.
- **OQ-3.** E-signature fields render as free-form canvas today. Legal weight (especially for
  consent forms) depends on jurisdiction; does VitalFlow need to capture an IP + device fingerprint
  into `answers.metadata.signature_provenance` to meet UETA/ESIGN? Confirm before enabling signature
  fields in the template schema.
- **OQ-4.** Retention of submitted forms — they become part of the patient chart and should follow
  the same retention rules as encounters (BR says `deleted_at`; confirm no hard-delete without a
  litigation hold check).
