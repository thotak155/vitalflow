# VitalFlow — Use Case Specifications

Formal use-case docs for features that are **not yet built** or are only partially built. Each file
follows the template in [`_template.md`](./_template.md) and corresponds to one gap item from the
2026-04-21 demo-readiness audit against the 30-item use-case backlog.

## How to use

- **Spec-first:** nothing lands in `apps/web/src/app/…` without a matching spec here.
- **Plan-driven:** each spec pairs with a Playwright e2e test skeleton in
  `apps/web/tests/e2e/uc-<id>.spec.ts` that acts as the acceptance test.
- **TDD gate:** the e2e test must exist (and fail) before the feature implementation is merged.
- **Code-review gate:** the `superpowers:code-reviewer` agent checks the implementation against its
  spec before commit.

## Conventions (derived from the Sprint 1 code review)

- **Surface grouping.** Four route roots: `/platform/*` (platform admins), `/admin/*` (tenant
  admins), `/` + other tenant-scoped routes (staff), `/my/*` (patient portal). A spec's UX Surface
  section MUST name which root its new route lives under.
- **Audit-event naming.** Every spec-proposed audit event MUST exist in `AUDIT_EVENT_TYPES` in
  `packages/auth/src/audit.ts` — same PR that ships the spec's implementation. `logEvent()`
  zod-validates against that enum; unlisted strings throw.
- **Notification `template_key` registry.** Use dotted names (`invite.staff`, `patient.arrived`,
  `note.pending_review`). When a spec invents a new one, register it in the template registry
  (deferred to an implementation sweep; for now, just use dotted naming).
- **Schema additions name their migration file.** Any spec with "NEW — proposed" tables/columns MUST
  include a target migration filename in its UX Surface or Data Model section (e.g.
  `20260422000001_intake_forms.sql`) so reviewers can sequence DDL before the app code lands.
- **Tenant-isolation test parity.** Every e2e skeleton should include one cross-tenant `.skip` test
  asserting that a tenant-B user cannot touch a tenant-A row through the feature. This mirrors every
  spec's BR-1.
- **Patient-surface gate.** Routes under `/my/*` MUST have a BR stating
  `session.userKind === 'patient'` is required; staff users 404.
- **Multi-location language.** The demo target is a 3-location pain-medicine practice. Any spec that
  touches scheduling, check-in, room booking, or staff routing MUST say what it does when a provider
  / patient / notification crosses location boundaries.

## Index (by group)

### A — Platform governance

| ID                                         | Title                                       | Priority          | Status |
| ------------------------------------------ | ------------------------------------------- | ----------------- | ------ |
| [A1](./UC-A1-super-admin-tenant-create.md) | Super-admin creates a new tenant / practice | demo-nice-to-have | Draft  |
| [A2](./UC-A2-invite-staff-by-email.md)     | Practice owner invites staff by email       | demo-critical     | Draft  |
| [A3](./UC-A3-invitation-acceptance.md)     | Staff accepts invitation and sets password  | demo-critical     | Draft  |
| [A8](./UC-A8-audit-log-reader.md)          | Admin reads audit events                    | demo-critical     | Draft  |

### B — Visit lifecycle

| ID                                           | Title                                         | Priority          | Status |
| -------------------------------------------- | --------------------------------------------- | ----------------- | ------ |
| [B2](./UC-B2-duplicate-patient-detection.md) | Duplicate patient detection on create         | demo-critical     | Draft  |
| [B3](./UC-B3-insurance-card-upload.md)       | Attach insurance card images to coverage      | demo-critical     | Draft  |
| [B5](./UC-B5-slot-conflict-detection.md)     | Slot-conflict detection on appointment create | demo-critical     | Draft  |
| [B8](./UC-B8-patient-intake-form.md)         | Patient completes pre-visit intake form       | demo-nice-to-have | Draft  |
| [B9](./UC-B9-patient-self-checkin.md)        | Patient self-checks in for visit              | demo-nice-to-have | Draft  |

### C — Clinical documentation

| ID                                      | Title                                                 | Priority      | Status |
| --------------------------------------- | ----------------------------------------------------- | ------------- | ------ |
| [C3](./UC-C3-manual-soap-entry.md)      | Provider enters SOAP draft manually (outside AI flow) | demo-critical | Draft  |
| [C7](./UC-C7-icd10-diagnosis-picker.md) | Provider picks diagnosis via ICD-10 search            | demo-critical | Draft  |

### D — AI augmentation

| ID                                         | Title                                    | Priority | Status |
| ------------------------------------------ | ---------------------------------------- | -------- | ------ |
| [D1a](./UC-D1a-audio-transcript-upload.md) | Provider uploads audio for transcription | v1.1     | Draft  |

## Pain-medicine V1.1 addenda

Not part of the 30-item backlog but flagged during the audit. These get specs later, not this
sprint.

- Prior-authorization queue
- PDMP lookup on controlled-substance prescribing
- Procedure-note templates (ESI / RFA / facet / SI)
- Pain-score trend + opioid risk tool
- Treatment-agreement artifact
