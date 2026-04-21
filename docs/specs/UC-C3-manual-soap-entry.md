# UC-C3 — Provider enters SOAP draft manually (outside AI flow)

> **Status:** Draft · **Group:** C (clinical documentation) · **Priority:** demo-critical

## Actors

- _Primary:_ Physician (role `physician`; holds `clinical:write` and `clinical:sign`).
- _Secondary:_ Nurse / MA (role `nurse_ma`; holds `clinical:write` but NOT `clinical:sign` — may
  save drafts only).

## Preconditions

- Caller is signed in, tenant context resolved via `getSession()` in `apps/web/src/lib/session.ts`.
- Caller holds `clinical:write` for the encounter's tenant.
- The target encounter exists in `public.encounters` and is not soft-deleted (`deleted_at IS NULL`).
  Encounter status is not required to be a specific value — drafts can be authored for `planned`,
  `arrived`, `in_progress`, or `finished` visits.
- `public.tenants.hipaa_baa_signed = true` for the tenant (clinical writes are blocked at DB level
  by the `require_baa_signed()` trigger otherwise).

## Trigger

Provider opens `/encounters/[id]` and clicks the "New note" button in the Clinical note card. Today
the workspace shows a Clinical note card (`EncounterWorkspacePage` in
`apps/web/src/app/(app)/encounters/[id]/page.tsx` around the `saveNoteDraft`/`signNote` server
actions) ONLY after an AI draft has been accepted — this use case makes that entry point always
available.

## Main Flow

1. On `/encounters/[id]`, when no current row exists in `public.encounter_notes` for this encounter
   (via the existing tip-query at page.tsx line ~929), the Clinical note card renders an empty state
   with a **New note** button instead of an AI-only CTA.
2. Clicking **New note** reveals an inline SOAP form (four textareas: Subjective, Objective,
   Assessment, Plan) — no navigation, no modal. The form is rendered in the same card.
3. Provider fills any subset of the four sections. All four are independently optional at save time
   (matches current column nullability — all four are `text` with no NOT NULL).
4. Provider clicks **Save draft**. Form posts to the existing `saveNoteDraft` server action
   (`apps/web/src/app/(app)/encounters/[id]/page.tsx` line ~245). The branch where `noteId` is empty
   fires — `insert` into `public.encounter_notes` with `tenant_id`, `encounter_id`, `patient_id`,
   `author_id = session.userId`, `type = 'soap'`, `status = 'draft'`, `ai_assisted = false` (DB
   default), and the four SOAP fields. The row-level audit trigger `encounter_notes_audit` fires
   automatically.
5. Action redirects back to `/encounters/[id]?ok=Note%20saved`; the card now shows the draft with
   Save / Sign / Amend controls and the draft is the "current" note per `clinical_notes_current`
   view.
6. Provider may click **Save + Sign** as a second button on the same form. Two-step server-action:
   first run `saveNoteDraft` to persist, then `signNote` (page.tsx line ~307). Sign requires
   `clinical:sign`; the button is hidden for `nurse_ma`. Signing writes a `public.signatures` row
   (subject_table=`'encounter_notes'`, SHA-256 `hash` over `id|version|signer|signed_at|content`)
   and flips `encounter_notes.status` to `'signed'` with `signed_by` / `signed_at` set.

## Alternate Flows

### A1. Nurse / MA saves but cannot sign

1. At step 6, caller lacks `clinical:sign` (role `nurse_ma`).
2. The **Save + Sign** button is not rendered by the page (the page already branches on
   `canSign = session.permissions.includes("clinical:sign")`). Only **Save draft** is available.
3. If a nurse bypasses the UI and POSTs to `signNote`, `requirePermission(session, "clinical:sign")`
   throws `forbidden` and returns `E_PERMISSION`.

### A2. Edit an existing draft

1. At step 1, an existing draft already exists for the encounter (`status = 'draft'`).
2. The **New note** button is not shown; the card renders the existing draft's four textareas
   pre-populated.
3. On Save, `saveNoteDraft` takes the update branch (`noteId` present): `update` on
   `encounter_notes` WHERE `id = noteId AND tenant_id = session.tenantId`. `ai_assisted` is NOT
   overwritten — it stays whatever it was (false for this flow, true for drafts that originated from
   an accepted AI scribe session).

### A3. Encounter already has a signed note

1. At step 1, the tip note (per `clinical_notes_current`) has `status = 'signed'`.
2. The **New note** button is replaced by **Amend note** (existing `amendNote` server action,
   page.tsx line ~701), which requires `clinical:amend` and a reason ≥ 5 chars. That flow is
   specified elsewhere (UC-C6 amendment) — this UC does NOT re-specify it. **New note** must NOT
   create a sibling draft when a signed tip exists; the version chain via `amended_from` is
   authoritative.

### A4. Validation — fully empty note

1. At step 4, all four textareas are blank.
2. The server action currently accepts this (all columns are nullable). **DEFINE — proposed**: add a
   client + server guard that at least one of the four fields must be non-empty, returning
   `E_VALIDATION` otherwise. Without this, an empty draft is insertable and visible in the history
   panel. See Open Questions OQ-1.

## Postconditions

- Happy path: new row in `public.encounter_notes` with `status = 'draft'`, `ai_assisted = false`,
  `version = 1`, `amended_from IS NULL`, `author_id = session.userId`.
- One INSERT audit event in `audit.audit_events` (table_name=`encounter_notes`) captured by the
  row-level trigger.
- If Save + Sign: additional row in `public.signatures` and UPDATE audit event flipping status to
  `'signed'`.
- The draft is the row returned by `public.clinical_notes_current` for this encounter.

## Business Rules

- **BR-1.** Tenant isolation — every query and write filters by `tenant_id = session.tenantId` in
  addition to RLS on `public.encounter_notes` (policies `encounter_notes_select` and
  `encounter_notes_write` require `has_permission('clinical:read'|'clinical:write', tenant_id)`).
- **BR-2.** `ai_assisted = false` must be explicit (or allowed to default) — it distinguishes this
  flow's notes from AI-accepted drafts in auditing and downstream training signal. AI-accepted
  drafts set `ai_assisted = true` and `ai_request_id`; this flow must leave `ai_request_id` NULL.
- **BR-3.** Signing is a separate permission gate (`clinical:sign`) and a separate action
  (`signNote`); saving does not auto-sign. This preserves the nurse-drafts-for-physician-signature
  workflow.
- **BR-4.** Signed notes are immutable. Any further change MUST go through `amendNote`
  (clinical:amend) which inserts a new row with `amended_from` set and flips the previous row to
  `status = 'amended'`.
- **BR-5.** The note-hash attestation in `public.signatures.hash` is computed over the exact
  four-section content at sign time (`computeNoteHash` in page.tsx). Content drift after signing is
  detectable.

## Exceptions

| Code           | When it happens                                                            | User-facing message                                     |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `E_PERMISSION` | Caller lacks `clinical:write` on save, or `clinical:sign` on save+sign     | "You don't have access to do this."                     |
| `E_VALIDATION` | Missing `encounter_id` or `patient_id`; (proposed) all four sections empty | "Missing encounter or patient" / "Note cannot be empty" |
| `E_CONFLICT`   | Attempt to save a draft while a signed tip exists (must use amend instead) | "Note already signed — use amend to modify"             |
| `E_RLS`        | RLS deny on insert (tenant mismatch, BAA unsigned)                         | "Save failed — please contact your administrator"       |

## Data Model Touchpoints

| Table                                  | Writes                                                                                                                                                                                                                 | Reads                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `public.encounter_notes`               | INSERT `tenant_id`, `encounter_id`, `patient_id`, `author_id`, `type='soap'`, `status='draft'`, `subjective`, `objective`, `assessment`, `plan`, `ai_assisted=false` (default); on edit, UPDATE those four text fields | SELECT tip via `status <> 'amended'` ORDER BY `version` DESC LIMIT 1; full history via `encounter_id` |
| `public.clinical_notes_current` (view) | —                                                                                                                                                                                                                      | SELECT for card header state (current note handle)                                                    |
| `public.signatures`                    | (Save + Sign only) INSERT `tenant_id`, `signer_id`, `subject_schema='public'`, `subject_table='encounter_notes'`, `subject_id=<note.id>`, `attestation`, `signed_at`, `hash`                                           | —                                                                                                     |
| `public.encounters`                    | —                                                                                                                                                                                                                      | SELECT `patient_id`, `status`, `deleted_at IS NULL`                                                   |
| `audit.audit_events`                   | (Trigger) INSERT on every encounter_notes/signatures row change                                                                                                                                                        | —                                                                                                     |

## Permissions Required

| Permission       | Enforced where                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `clinical:read`  | Page guard in `EncounterWorkspacePage` (`requirePermission(session, "clinical:read")`); `encounter_notes_select` RLS policy                  |
| `clinical:write` | Server action `saveNoteDraft` (`requirePermission(session, "clinical:write")`); `encounter_notes_write` RLS policy                           |
| `clinical:sign`  | Server action `signNote` (`requirePermission(session, "clinical:sign")`); UI hides the Sign button when absent (`canSign` in page.tsx ~1080) |

All three are granted to `practice_owner` and `physician`; `nurse_ma` has only `clinical:read` and
`clinical:write`. Impersonators have `clinical:write` and `clinical:sign` stripped by
`IMPERSONATION_BLOCKED` in `packages/auth/src/rbac.ts`.

## UX Surface

- **Route:** `/encounters/[id]` (existing — no new route).
- **Component:** NEW — proposed `ManualSoapEntryCard` (or inline enhancement to the existing
  Clinical note card block inside `EncounterWorkspacePage`). Renders the **New note** button when
  `note == null` and `encounter.deleted_at == null`.
- **Server actions (existing, reused):** `saveNoteDraft`, `signNote` in
  `apps/web/src/app/(app)/encounters/[id]/page.tsx`.
- **Audit events:** row-level INSERT/UPDATE on `public.encounter_notes` and `public.signatures` via
  `audit.log_change()` trigger. No new semantic event needed; `note.amended` is reserved for the
  amend path.

## Test Plan

- **Happy path
  (`uc-c3-manual-soap-entry.spec.ts › should let a physician create and save a SOAP draft inline`):**
  sign in as a physician, open an encounter with no existing note, click **New note**, fill all four
  sections, click **Save draft**, assert the card re-renders showing the draft with status `draft`
  and `ai_assisted = false`.
- **Alt path — save + sign
  (`uc-c3-manual-soap-entry.spec.ts › should sign a draft in the same action`):** as above but click
  **Save + Sign**, provide attestation text, assert `status = signed`, assert one row in
  `public.signatures` and the UI badge flips to Signed.
- **Alt path — nurse draft-only
  (`uc-c3-manual-soap-entry.spec.ts › nurse can save but cannot see the Sign button`):** sign in as
  `nurse_ma`, open encounter, fill and save draft successfully, assert the Save + Sign button is not
  in the DOM.
- **Negative — permission denied
  (`uc-c3-manual-soap-entry.spec.ts › should 403 when a scheduler POSTs directly`):** sign in as
  `scheduler`, POST to `saveNoteDraft`, assert redirect with `forbidden` error in the URL.
- **Negative — signed tip blocks New note
  (`uc-c3-manual-soap-entry.spec.ts › should show Amend instead of New note when a signed note exists`):**
  seed a signed note on the encounter, assert only the Amend control is present.

## Open Questions

- **OQ-1.** Should `saveNoteDraft` reject fully-empty submissions (no S, O, A, or P text)? Current
  server action accepts them because all four columns are nullable. A "cannot save empty note" guard
  seems obviously correct for UX but changes the contract — decide before implementation.
- **OQ-2.** Should the **New note** button default to a template (e.g., pre-filled "HPI:" / "ROS:" /
  "Physical exam:" headers inside `subjective` / `objective`)? If yes, templates need a per-tenant
  admin surface and seed data — adds scope. For demo, blank is fine.
- **OQ-3.** Do nurses/MAs flag their drafts as "ready for provider review"
  (`status = 'pending_review'`)? **Resolved (recommendation):** wire `pending_review` into the save
  path as an optional "Send to physician for review" checkbox on the draft form. Authors with
  `clinical:write` (nurse_ma, physician) can flip it; flipping writes `status='pending_review'` +
  inserts a notifications row to the encounter's `provider_id` with
  `template_key='note.pending_review'`. Physicians see it in /inbox and transition to `signed` via
  the existing `signNote` action. If this isn't wired in UC-C3's first PR, delete the unused enum
  value in a follow-up migration so the schema matches the code.
- **OQ-4.** `saveNoteDraft` and `signNote` are two separate writes today and are not wrapped in a
  single transaction. Save + Sign wired as "call save then call sign sequentially" has the same race
  that `signNote` documents (partial failure leaves an unsigned draft). Acceptable for V1, or add an
  RPC that does both?
