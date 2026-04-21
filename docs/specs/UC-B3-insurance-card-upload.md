# UC-B3 — Attach insurance card images to coverage

> **Status:** Draft · **Group:** B (visit lifecycle) · **Priority:** demo-critical

## Actors

- _Primary:_ Front Desk, Office Admin (roles `office_admin`, `practice_owner`)
- _Secondary:_ Biller (role `biller`) — read-only access to cards for claim packets

## Preconditions

- A patient chart exists (`public.patients`).
- At least one coverage row exists on the chart (`public.patient_coverages`) to which the cards will
  be attached.
- Caller is authenticated with a tenant context and holds `patient:write` (coverage edit is gated on
  this today — see `addCoverage` in `apps/web/src/app/(app)/patients/[id]/page.tsx`).
- A Supabase Storage bucket dedicated to coverage card images exists — **NEW — proposed:**
  `coverage-cards` (private, signed-URL access, mirroring the `scribe-raw` bucket pattern already
  documented in `project_scribe_bucket.md` and referenced in
  `supabase/migrations/20260420000002_ai_scribe.sql` via `ai_scribe_sessions.audio_storage_path`).

## Trigger

User opens the patient chart at `/patients/[id]` and clicks **Upload card** on a coverage row in the
Coverages card, or uploads while initially creating the coverage.

## Main Flow

1. User navigates to `/patients/[id]` and locates the target coverage in the **Coverages** card.
2. User clicks **Upload card → Front** on the coverage row. A file picker opens (image/jpeg,
   image/png, application/pdf; max 8 MB).
3. Browser POSTs the file to a new server action
   `uploadCoverageCard({ coverageId, side: 'front' | 'back', file })`.
4. Server action: a. Re-checks `patient:write`. b. Confirms the coverage exists and belongs to the
   caller's tenant via `public.patient_coverages` select. c. Uploads the bytes to Supabase Storage
   bucket `coverage-cards` at path `<tenant_id>/<patient_id>/<coverage_id>/<side>-<uuid>.<ext>`. d.
   Inserts a row into `public.attachments` with `category = 'insurance_card'`,
   `storage_bucket = 'coverage-cards'`, `storage_path = <same as c>`,
   `patient_id = <coverage.patient_id>`, `mime_type`, `size_bytes`, and
   `metadata = { coverage_id, side }`. e. Writes the attachment id back onto the coverage via **NEW
   — proposed** columns
   `patient_coverages.card_front_attachment_id uuid references public.attachments(id) on delete set null`
   and `card_back_attachment_id uuid ...`.
5. On success, page revalidates and the coverage row shows a thumbnail + "Front uploaded · 2 MB"
   (and a **Replace** / **Remove** affordance). Clicking the thumbnail opens a signed URL (short
   TTL, 5 min) in a new tab.
6. User repeats for the back of the card.

## Alternate Flows

### A1. Replace an existing card image

1. _At step 2_ a front-card image already exists.
2. The upload action soft-deletes the previous attachment (`attachments.deleted_at = now()`) and
   points `card_front_attachment_id` at the new row in the same transaction (or tightest-possible
   sequence, since Supabase Storage is not in the DB transaction). The storage object for the old
   card is scheduled for removal by a nightly sweeper (out of scope here).

### A2. Remove a card

1. User clicks **Remove** on a card thumbnail.
2. Server action `removeCoverageCard({ coverageId, side })` nulls the card\_\*\_attachment_id column
   and soft-deletes the attachment. The storage object is removed on the next sweeper run.

### A3. PDF instead of image

1. _At step 2_ user uploads a PDF (common when a payer emails a card as a scan).
2. The attachment row stores `mime_type = 'application/pdf'`; the UI renders a PDF icon instead of a
   thumbnail, linking to the signed URL.

### A4. File too large / wrong type

1. Validation fails before upload starts.
2. UI shows inline error: "Cards must be JPG, PNG, or PDF and under 8 MB."

## Postconditions

- One or two rows in `public.attachments` (front, back) with `category='insurance_card'` and
  `metadata.coverage_id` set.
- The corresponding `public.patient_coverages` row has `card_front_attachment_id` and/or
  `card_back_attachment_id` populated.
- One or two objects in Storage bucket `coverage-cards` at the tenant-scoped path.
- `attachments_audit` / `patient_coverages_*` audit rows fired via existing triggers.

## Business Rules

- **BR-1.** Bucket `coverage-cards` is **private** — no public read. All access goes through
  server-generated signed URLs with TTL ≤ 10 minutes.
- **BR-2.** Storage path MUST begin with the tenant UUID so any future Storage-side RLS policy can
  enforce tenant isolation by prefix match (same pattern as `scribe-raw`).
- **BR-3.** `public.attachments.tenant_id` MUST match the coverage's tenant — double-checked
  server-side before insert. RLS on `attachments` already enforces tenant via
  `public.current_user_tenant_ids()`.
- **BR-4.** Biller role can READ cards (needed for claim packets) but cannot upload or remove — RLS
  on `attachments` uses `clinical:read` for select (see migration 0004); biller has `clinical:read`
  so this works. Upload/remove require `patient:write`.
- **BR-5.** Soft delete preserves audit trail; hard delete of the storage object happens
  asynchronously outside the request.

## Exceptions

| Code           | When it happens                                                    | User-facing message                                                                                        |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `E_PERMISSION` | Caller lacks `patient:write`                                       | "You don't have access to edit coverages."                                                                 |
| `E_VALIDATION` | Bad MIME type or file > 8 MB                                       | "Cards must be JPG, PNG, or PDF and under 8 MB."                                                           |
| `E_NOT_FOUND`  | Coverage id doesn't exist in this tenant                           | "Coverage not found."                                                                                      |
| `E_STORAGE`    | Supabase Storage upload failed (network, quota)                    | "Upload failed. Try again."                                                                                |
| `E_DB`         | Attachment insert or coverage update failed after upload succeeded | "Saved the file but couldn't link it — contact support." (and the storage object is scheduled for cleanup) |

## Data Model Touchpoints

| Table                                                                                           | Writes                                                                                                                                                                                                                 | Reads                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `public.attachments` (existing — `supabase/migrations/20260416000004_clinical_orders.sql:279`)  | `tenant_id`, `patient_id`, `uploaded_by`, `storage_bucket='coverage-cards'`, `storage_path`, `mime_type`, `size_bytes`, `category='insurance_card'`, `metadata.coverage_id`, `metadata.side`, `deleted_at` (on remove) | `id`, `storage_bucket`, `storage_path`, `mime_type`, `deleted_at` |
| `public.patient_coverages` (existing — `supabase/migrations/20260416000005_erp_billing.sql:81`) | **NEW — proposed** `card_front_attachment_id uuid`, `card_back_attachment_id uuid` (both `references public.attachments(id) on delete set null`)                                                                       | All existing selected columns + the two new ids                   |
| Supabase Storage bucket `coverage-cards` (NEW — proposed)                                       | Binary object at `<tenant_id>/<patient_id>/<coverage_id>/<side>-<uuid>.<ext>`                                                                                                                                          | Signed-URL download on render                                     |

## Permissions Required

| Permission                       | Enforced where                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patient:write`                  | Server actions `uploadCoverageCard` / `removeCoverageCard`, existing coverages RLS `with check` policy                                                                                                                                                                           |
| `patient:read` / `clinical:read` | RLS on `patient_coverages_rls` (uses `billing:read`) and `attachments_rls` (uses `clinical:read`) for rendering cards. Note: `attachments_rls` predicates on `clinical:read`, so scheduler (no clinical:read) cannot view cards — confirm this is intended (see Open Questions). |
| `billing:read`                   | RLS on `patient_coverages_rls` select — already enforced today                                                                                                                                                                                                                   |

## UX Surface

- **Route:** `/patients/[id]` — `apps/web/src/app/(app)/patients/[id]/page.tsx`, extended Coverages
  card
- **Server actions:** `uploadCoverageCard`, `removeCoverageCard` (NEW, co-located in the page file
  or in `apps/web/src/lib/coverage/cards.ts`)
- **Audit event:** `attachments` insert / update via `audit.log_change()` (existing trigger on
  `public.attachments`); `patient_coverages` update via its existing audit trigger.

## Test Plan

- **Happy path:** `uc-b3-insurance-card-upload › uploads front and back card images` — seed
  coverage, upload two PNGs, expect thumbnails + attachment rows.
- **Alt A1 (replace):** `uc-b3 › replacing a card soft-deletes the previous attachment`.
- **Alt A2 (remove):** `uc-b3 › removing a card clears card_front_attachment_id`.
- **Alt A3 (PDF):** `uc-b3 › accepts a PDF upload and renders a PDF icon`.
- **Alt A4 (validation):** `uc-b3 › rejects a 20 MB JPEG with a clear message`.
- **Negative:**
  `uc-b3 › a user without patient:write sees no Upload button and the server action returns 403`.

## Open Questions

- **OQ-1.** Scheduler role has `patient:read` but NOT `clinical:read`, and `attachments_rls`
  requires `clinical:read` for select. **Resolved (recommendation):** lower the RLS bar to
  `patient:read` when `category='insurance_card'` — schedulers verify insurance at the desk,
  blocking their view breaks the core workflow. Implementation: split the `attachments_rls` select
  policy into two — a general clinical-docs policy that stays on `clinical:read`, and a dedicated
  `attachments_insurance_card_select` policy that uses `patient:read` scoped to
  `category = 'insurance_card'`.
- **OQ-2.** Bucket naming + retention: should `coverage-cards` follow the 90-day retention sweeper
  pattern the scribe bucket is planned for, or are cards kept for the life of the coverage? Billing
  usually needs them during claim follow-up (up to 12 months). Confirm before wiring `pg_cron`.
- **OQ-3.** PHI in filenames: a UUID in the storage path is fine, but the original filename may leak
  PHI into logs. Proposal: drop the original filename entirely on upload; keep only
  `<side>-<uuid>.<ext>`. Confirm that's acceptable (no UX needs the original filename back).
