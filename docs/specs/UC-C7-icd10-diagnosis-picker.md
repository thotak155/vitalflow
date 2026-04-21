# UC-C7 — Provider picks diagnosis via ICD-10 search

> **Status:** Draft · **Group:** C (clinical documentation) · **Priority:** demo-critical

## Actors

- _Primary:_ Physician (role `physician`; holds `clinical:write`).
- _Secondary:_ Coder — represented as a `biller` (role `biller` holds `clinical:read` only; see Open
  Questions). `practice_owner` and `office_admin` also qualify operationally.

## Preconditions

- Caller is signed in and holds `clinical:write` for the encounter's tenant (required by
  `diagnosis_assignments_insert` RLS).
- The target encounter row exists in `public.encounters` and is not soft-deleted.
- Fewer than 12 active diagnoses already attached to the encounter (the server action enforces
  `nextRank <= 12`; the DB index `diagnosis_assignments_rank_unique_active` enforces one active row
  per rank).

## Trigger

On `/encounters/[id]`, the provider clicks **Add diagnosis** in the Diagnoses panel. Today this
renders a pair of free-text inputs (ICD-10 code + description) that post to `assignDiagnosis`
(`apps/web/src/app/(app)/encounters/[id]/page.tsx` line ~403). This UC replaces the free-text code
input with a search-driven picker that hydrates both fields from a validated record.

## Main Flow

1. User clicks **Add diagnosis**. A combobox opens with a text input (debounced, 250ms) labelled
   "Search ICD-10 code or description". Placeholder: "e.g. J02.9, type 2 diabetes".
2. As the user types ≥ 2 characters, the combobox calls a NEW — proposed lookup endpoint
   `/api/v1/clinical/icd10?q=<query>` which returns the top N (≤ 20) matches as
   `{ code, description }[]`. Source is decided in Open Questions (seeded table vs NLM Clinical
   Tables API).
3. Each match renders as a button: mono-font code + description. Keyboard navigation with arrow
   keys + Enter.
4. User selects a row. The combobox closes and reveals the rank + pointer + present-on-admission
   inputs below it (these already exist in the V1 form):
   - `rank` — auto-filled to `max(rank)+1` among active assignments (server recomputes
     authoritatively), editable in the UI so the user can insert at a specific rank ≤ 12.
   - `pointer` — single letter A–L (matches DB CHECK `pointer ~ '^[A-L]$'`).
   - `present_on_admission` — optional select: Y / N / U / W (matches DB CHECK).
5. User clicks **Add**. The form POSTs to the existing `assignDiagnosis` server action; the `code`
   and `description` fields are the values selected in step 4 (read-only on the client, but still
   sent through the action for server-side re-validation).
6. Server action runs `requirePermission(session, "clinical:write")`, validates `code` against the
   regex `^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$`, computes `nextRank` (or accepts a user-picked rank —
   see Open Questions), and inserts into `public.diagnosis_assignments` with `tenant_id`,
   `patient_id`, `encounter_id`, `code_system = 'icd10-cm'`, `code`, `description`, `rank`,
   `pointer`, `present_on_admission`, `assigned_by = session.userId`. The audit trigger
   `diagnosis_assignments_audit` captures the INSERT.
7. Redirect to `/encounters/[id]?ok=Added%20<CODE>%20at%20rank%20<N>`. The Diagnoses panel
   re-renders with the new row in rank order and the card's rank chip updates.

## Alternate Flows

### A1. No matches for the query

1. At step 2, the lookup returns zero results.
2. Combobox shows "No matches. Try a shorter term or a code prefix." The free-text fallback is NOT
   offered — if the catalogue is wrong, the user files feedback rather than bypassing validation.
   Prevents hand-typed codes from re-entering the system.

### A2. Lookup endpoint unavailable

1. At step 2, the fetch errors (network, 5xx, rate-limit from NLM if that's the source).
2. Combobox shows "Lookup unavailable — retry or contact support." If the chosen source is the
   external NLM API, a local-cache fallback is TBD (see Open Questions).

### A3. Rank collision

1. At step 5, another user has concurrently claimed the auto-suggested rank.
2. DB INSERT violates the partial unique index
   `diagnosis_assignments_rank_unique_active (encounter_id, rank) WHERE removed_at IS NULL`.
3. Server action catches the Postgres error, bumps `nextRank += 1`, retries up to 3 times. Returns
   `E_CONFLICT` if still unresolved after retries (unlikely in practice — rank cap is 12).

### A4. Duplicate code on same encounter (non-unique today)

1. Schema does NOT uniquely constrain `(encounter_id, code)` — only `(encounter_id, rank)`. A user
   could legitimately add `E11.9` twice at different ranks.
2. **DEFINE — proposed:** pre-insert SELECT to warn "This code is already on the encounter at rank N
   — add again?" but do not block. Informational only. See Open Questions.

### A5. Link to problem list

1. At any point in the form, the user checks **Promote to problem list**.
2. The server action additionally inserts (or resolves) a row in `public.problems` (patient-level
   running list; distinct from encounter-scoped `diagnosis_assignments`) and populates
   `diagnosis_assignments.problem_id`. Out of scope for V1 — tracked in Open Questions.

## Postconditions

- New row in `public.diagnosis_assignments` with `removed_at IS NULL`, `assigned_by` = caller,
  `rank` ≤ 12, `code_system = 'icd10-cm'`.
- One INSERT event in `audit.audit_events` for table `diagnosis_assignments`.
- The Diagnoses panel on `/encounters/[id]` shows the new row; the Charge-capture `DiagnosisPicker`
  (which reads `diagnosis_assignments` via `getChargeCaptureContext.ts`) now includes this code as a
  selectable diagnosis pointer for charges.

## Business Rules

- **BR-1.** Tenant isolation — every insert sets `tenant_id = session.tenantId` and passes the RLS
  check
  `tenant_id in (select public.current_user_tenant_ids()) and public.has_permission('clinical:write', tenant_id)`.
- **BR-2.** Only validated ICD-10-CM codes may be inserted. The server-side regex guard in
  `assignDiagnosis` is the final line of defence; the picker enforces it earlier by only letting the
  user click pre-validated matches.
- **BR-3.** Rank is bounded 1..12 (DB CHECK); the first active assignment at rank=1 represents the
  principal diagnosis for billing purposes.
- **BR-4.** Pointer must be a single letter A–L. `present_on_admission` ∈ {Y,N,U,W} per CMS
  convention.
- **BR-5.** Removal is soft-delete only (`update removed_at = now()`); historic rows remain for
  audit. Hard delete is never exposed in the UI.
- **BR-6.** If the lookup source is the external NLM Clinical Tables API, PHI MUST NOT be sent in
  the query. The query string is the user's typed text; implementors must ensure the UI does not
  auto-populate it with patient name / MRN.

## Exceptions

| Code                   | When it happens                                                                     | User-facing message                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `E_PERMISSION`         | Caller lacks `clinical:write` (e.g., a `scheduler` or `biller` with read-only role) | "You don't have access to do this."                                      |
| `E_VALIDATION`         | `code`/`description` empty, code regex fails, or rank > 12                          | "ICD-10 code format looks off" / "Max 12 active diagnoses per encounter" |
| `E_CONFLICT`           | Rank-unique index collision after retry                                             | "Rank already taken — please retry"                                      |
| `E_LOOKUP_UNAVAILABLE` | External ICD-10 lookup down (if NLM is the source)                                  | "Code lookup is unavailable — please retry in a moment."                 |

## Data Model Touchpoints

| Table                                     | Writes                                                                                                                                                      | Reads                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `public.diagnosis_assignments`            | INSERT `tenant_id`, `patient_id`, `encounter_id`, `code_system='icd10-cm'`, `code`, `description`, `rank`, `pointer`, `present_on_admission`, `assigned_by` | SELECT `rank` WHERE `encounter_id = $1 AND removed_at IS NULL` ORDER BY `rank` DESC LIMIT 1 (to compute `nextRank`)     |
| `public.encounters`                       | —                                                                                                                                                           | SELECT `patient_id` for the FK, `deleted_at IS NULL`, tenant scope                                                      |
| `public.icd10_codes` **(NEW — proposed)** | —                                                                                                                                                           | SELECT `code`, `description` WHERE `code ILIKE $q OR description ILIKE $q` LIMIT 20 — _only if local-table option wins_ |
| `public.problems`                         | (Out of scope for V1) INSERT / UPDATE if "Promote to problem list" is checked                                                                               | —                                                                                                                       |
| `audit.audit_events`                      | (Trigger) row-level INSERT on `diagnosis_assignments`                                                                                                       | —                                                                                                                       |

## Permissions Required

| Permission       | Enforced where                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clinical:read`  | Page guard on `/encounters/[id]`; `diagnosis_assignments_select` RLS policy                                                                                                                |
| `clinical:write` | Server action `assignDiagnosis` (`requirePermission(session, "clinical:write")`, page.tsx ~407); `diagnosis_assignments_insert` RLS policy (`has_permission('clinical:write', tenant_id)`) |

`clinical:write` is held by `practice_owner`, `physician`, `nurse_ma`. `biller` does NOT hold it —
see Open Questions on coder access.

The lookup endpoint `/api/v1/clinical/icd10` should require authentication only (no tenant-scoped
permission) if the catalogue is tenant-agnostic. Rate-limit per-user.

## UX Surface

- **Route:** `/encounters/[id]` (existing — the picker is an inline component on the Diagnoses
  card).
- **New component:** `Icd10Picker` (NEW — proposed) — client component that wraps the existing
  hidden `<input name="code">` / `<input name="description">` fields consumed by `assignDiagnosis`.
  Drop-in replacement for the two free-text inputs; preserves the server-action shape.
- **New endpoint:** `GET /api/v1/clinical/icd10?q=<query>` → `{ results: { code, description }[] }`
  (NEW — proposed). Implementation backed by either `public.icd10_codes` or the NLM Clinical Tables
  proxy (see OQ-1).
- **Server action (existing, reused):** `assignDiagnosis` in
  `apps/web/src/app/(app)/encounters/[id]/page.tsx`.
- **Audit event:** row-level INSERT on `diagnosis_assignments` via trigger. No new semantic event
  needed.

## Test Plan

- **Happy path
  (`uc-c7-icd10-diagnosis-picker.spec.ts › should search by description and add a diagnosis`):**
  sign in as physician, open encounter, click Add diagnosis, type "diabetes", assert NLM/local
  results appear, click the E11.9 row, submit with rank=1 and pointer=A, assert the diagnoses panel
  shows `E11.9 — Type 2 diabetes mellitus without complications` at rank 1.
- **Alt path — search by code
  (`uc-c7-icd10-diagnosis-picker.spec.ts › should search by ICD-10 code prefix`):** type "J02",
  assert `J02.9` appears in the list; select and submit.
- **Alt path — rank auto-increment
  (`uc-c7-icd10-diagnosis-picker.spec.ts › should auto-assign rank to max+1`):** start with one
  existing assignment at rank 1, add a second, assert the new row appears at rank 2 without the user
  touching the rank input.
- **Negative — permission denied
  (`uc-c7-icd10-diagnosis-picker.spec.ts › should 403 when biller POSTs directly`):** sign in as
  `biller` (clinical:read only), POST to `assignDiagnosis`, assert redirect with forbidden error.
- **Negative — zero results
  (`uc-c7-icd10-diagnosis-picker.spec.ts › should show No matches empty state`):** type "qqqzzz",
  assert empty-state copy, assert Add button disabled.
- **Negative — code-regex bypass
  (`uc-c7-icd10-diagnosis-picker.spec.ts › should reject malformed code at server`):** POST raw form
  with `code=ABC` (simulating a tampered client), assert validation-error redirect.

## Open Questions

- **OQ-1. ICD-10 lookup source (DEFINE before implementation).** Two options:
  - **(a) Local seeded table** `public.icd10_codes` — import the CMS ICD-10-CM FY2026 public
    `icd10cm_order_2026.txt` file (free, public domain; ~74k rows). Pros: deterministic, HIPAA-safe,
    fast, offline. Cons: one-shot-per-year refresh, ~5 MB schema-owned data.
  - **(b) External API** via NLM Clinical Tables
    (`https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=<q>`) proxied through a Next.js
    route. Pros: zero maintenance, always current. Cons: external dependency, latency, outage mode
    unclear, need to confirm no PHI ends up in the query string.
  - Recommendation: pick (a) for V1 — table + a one-shot seed script that pulls from the CMS file.
    Revisit if keyword-search quality is weak.
- **OQ-2. Coder access model.** Today `biller` role has `clinical:read` but not `clinical:write`, so
  the picker is read-only for coders. If the workflow needs a dedicated Coder role that can assign
  diagnoses without being able to sign notes, add `coder` to the role enum and grant
  `{clinical:read, clinical:write}` minus note-signing. Affects `StaffRole` union,
  `ROLE_PERMISSIONS` in `packages/auth/src/rbac.ts`, and the `public.has_permission()` SQL function.
- **OQ-3. User-picked rank vs forced auto-rank.** Current server action always sets
  `rank = max + 1`. If the UI exposes a rank selector for insertion order, the action must accept
  the user's rank AND shift other active rows' ranks down (or the UI is lying). Simpler: keep
  auto-rank and add a "Reorder diagnoses" drag-and-drop in a separate UC.
- **OQ-4. Duplicate-code warning.** DB allows `E11.9` at rank 1 and rank 2 simultaneously. Should
  the UI block, warn, or ignore?
- **OQ-5. Problem-list promotion.** Checkbox "Also add to problem list" was mentioned in scope but
  out-of-scope for V1. Confirm the deferral or pull it forward; if forward, spec the
  `public.problems` interaction (idempotency, status transitions).
