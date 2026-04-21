# UC-B2 — Duplicate patient detection on create

> **Status:** Draft · **Group:** B (visit lifecycle) · **Priority:** demo-critical

## Actors

- _Primary:_ Scheduler, Front Desk (role `scheduler`)
- _Secondary:_ Office Admin (role `office_admin`), Practice Owner (role `practice_owner`)

## Preconditions

- Caller is authenticated with a tenant context and holds `patient:write`.
- At least one patient already exists in the tenant (otherwise the lookup is trivially empty and the
  flow short-circuits to a direct insert).
- First name, last name, and DOB are available on the form — these are the minimum matchable fields.

## Trigger

User submits the **New patient** form at `/patients/new`
(`apps/web/src/app/(app)/patients/new/page.tsx`). Today the server action `createPatient` inserts
straight into `public.patients` with no de-duplication; this spec interposes a lookup step between
validation and insert.

## Main Flow

1. User fills given name, family name, DOB, sex at birth, and (optional) phone / email in the
   demographics form.
2. User clicks **Create patient**. Server action `createPatient` validates required fields (same
   checks as today: non-empty names, `YYYY-MM-DD` DOB, sex chosen).
3. Server action invokes new helper
   `findDuplicatePatientCandidates(tenantId, { given, family, dob, phone?, email? })` which runs two
   queries against the current tenant:
   - **Exact match:** `lower(given_name)||lower(family_name) = lower(given)||lower(family)` AND
     `date_of_birth = :dob` AND `deleted_at is null` (uses index `patients_tenant_dob_idx`).
   - **Fuzzy name match:** trigram similarity on `lower(given_name)||' '||lower(family_name)` ≥ 0.6
     AND DOB within ±1 day (uses `patients_tenant_name_idx`).
   - If phone or email provided, also join `public.patient_contacts` on
     `type in ('phone_mobile','phone_home','phone_work','email')` AND `value ilike :value` to
     surface contact-based matches for patients whose legal name differs.
4. If the candidate list is empty → proceed with the existing insert into `public.patients` and
   redirect to `/patients/:id`.
5. If the candidate list is non-empty → redirect back to `/patients/new?review=1&token=<signed>`
   where `token` encodes the submitted form values. The page renders a **Possible duplicate** panel
   listing each candidate's MRN, full name, DOB, primary contact, and created-at.
6. User must pick one of two explicit actions:
   - **Open existing chart** → navigate to `/patients/:candidateId` (no write).
   - **This is a new patient** → re-submit the form with `confirm_new=1` which bypasses the lookup
     and runs the insert.
7. On confirmed insert, redirect to `/patients/:id`.

## Alternate Flows

### A1. Contact-only match

1. _At step 3_ the name+DOB query returns empty but the phone/email join returns one or more
   patients (common when a patient's legal name was entered slightly differently previously).
2. Flow continues as the main flow step 5 — the UI labels these candidates as "Contact match" rather
   than "Name match".

### A2. Confirm-new short-circuit

1. _At step 2_ the form contains `confirm_new=1` because the user already reviewed candidates and
   chose to proceed.
2. The server action skips `findDuplicatePatientCandidates` and inserts directly. The audit row (see
   Business Rules) records `duplicate_confirm_override=true`.

### A3. User cancels from the review panel

1. _At step 6_ the user clicks **Cancel** and is returned to `/patients` with no insert.
2. No row is written; no audit event is emitted (the form submission is treated as abandoned).

## Postconditions

- Either a new row exists in `public.patients` (tenant-scoped), **or** the user has navigated to an
  existing chart without creating a row.
- When a new row is created after the user saw candidates, the `public.patients.metadata` JSONB
  includes `{ "duplicate_check": { "candidates_shown": N, "confirmed_new_at": "<iso>" } }` so later
  audit can trace the decision.
- The RLS-enforced `patients_audit` trigger fires as it does today.

## Business Rules

- **BR-1.** Tenant isolation: the duplicate lookup MUST filter on `tenant_id = session.tenantId`.
  Cross-tenant matches are not possible and are not shown.
- **BR-2.** The duplicate check is advisory, not blocking — a user who consciously confirms "This is
  a new patient" can always proceed. We never silently fail a legitimate create.
- **BR-3.** Phone/email lookup normalizes before compare: phone digits-only, email `lower()`.
  Contacts with `deleted_at is not null` are excluded.
- **BR-4.** Permission `patient:write` is checked twice — once on the GET of `/patients/new`
  (page-level) and once on the server action (re-check on submit).
- **BR-5.** The candidate list is capped at 10 rows; if more match, a "(+N more)" affordance links
  to `/patients?q=<name>` for a full search.

## Exceptions

| Code           | When it happens                                               | User-facing message                                     |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `E_PERMISSION` | Caller lacks `patient:write`                                  | "You don't have access to add patients."                |
| `E_VALIDATION` | Missing first name / last name / DOB / sex, or bad DOB format | Field-level error (same messages as today)              |
| `E_DUP_REVIEW` | Candidates found; user has not yet confirmed                  | Rendered inline: "We found N patients who might match." |
| `E_DB`         | Insert fails (e.g., MRN collision, RLS refusal)               | "Couldn't create patient — please try again."           |

## Data Model Touchpoints

| Table                                                   | Writes                                                                                                                                                 | Reads                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.patients`                                       | `tenant_id`, `mrn`, `given_name`, `family_name`, `preferred_name`, `date_of_birth`, `sex_at_birth`, `pronouns`, `metadata` (new `duplicate_check` key) | `id`, `mrn`, `given_name`, `family_name`, `date_of_birth`, `preferred_name`, `created_at` — filtered by `tenant_id` and `deleted_at is null` |
| `public.patient_contacts`                               | — (no writes in this UC)                                                                                                                               | `patient_id`, `type`, `value` — filtered by tenant + `deleted_at is null` for phone/email match                                              |
| `audit.audit_events` (via `audit.log_change()` trigger) | Row-change record for the insert, including `tenant_id` and `actor_id`                                                                                 | —                                                                                                                                            |

## Permissions Required

| Permission      | Enforced where                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `patient:write` | Page `/patients/new` (server component gate), server action `createPatient` (re-check), Postgres RLS on `patients_write` policy |
| `patient:read`  | RLS on candidate lookup (`patients_select` policy requires `patient:read`; `scheduler` has it)                                  |

## UX Surface

- **Route (create):** `/patients/new` — `apps/web/src/app/(app)/patients/new/page.tsx`
- **Route (review):** `/patients/new?review=1&token=<signed>` (same page, branch on
  `searchParams.review`)
- **Server action:** `createPatient` (existing) extended with `findDuplicatePatientCandidates`
  helper (new, proposed in `apps/web/src/lib/patients/duplicate-check.ts`)
- **Audit event:** emitted via existing `patients_audit` trigger on insert (no new audit wiring).

## Test Plan

- **Happy path (no duplicate):**
  `uc-b2-duplicate-patient-detection › creates patient when no duplicate exists` — fill unique
  name+DOB, expect redirect to `/patients/:id`.
- **Alt path A1 (name match):** `uc-b2 › shows candidate panel when name+DOB matches` — seed a
  patient, submit same name+DOB, expect review panel with 1 row.
- **Alt path A1 (contact match):**
  `uc-b2 › shows candidate panel when phone matches a different-name patient`.
- **Alt path A2 (confirm new):** `uc-b2 › inserts after user confirms new patient` — candidate panel
  → click "This is a new patient" → expect chart page.
- **Negative:** `uc-b2 › rejects submission when patient:write is missing` — session without
  permission, expect 403 / redirect.

## Open Questions

- **OQ-1.** What similarity threshold balances false positives vs. false negatives for the trigram
  match? 0.6 is a guess — is there an existing customer-support ticket or pilot-practice pattern
  (e.g. hyphenated names, diacritics) we should measure against before locking the cutoff?
- **OQ-2.** Should the review page expose "merge these two charts" as a future action, or is that
  strictly an admin-only flow that belongs in UC-B2b? If yes, `patients.metadata.duplicate_check`
  should also capture the _rejected_ candidate IDs (so a later merge tool can reason about the
  decision); if no, we just record the count.
- **OQ-3.** Phone normalization — US-only digits-only is easy, but international numbers with
  country code need a library decision (`libphonenumber-js` is already a likely dep). Confirm before
  implementation.
