# UC-A1 — Super-admin creates a new tenant / practice

> **Status:** Draft · **Group:** A (governance) · **Priority:** demo-nice-to-have

## Actors

- _Primary:_ Super Admin (`auth.users` with `public.profiles.user_kind = 'platform'` and an
  un-revoked row in `public.platform_admins`, role `super_admin`).
- _Secondary:_ Prospective Practice Owner (receives the bootstrap invite after the tenant is
  provisioned).

## Preconditions

- Caller is authenticated via the web app and holds a valid (non-revoked) row in
  `public.platform_admins`. `public.is_platform_admin()` must return `true`.
- Caller's WebAuthn step-up (where `platform_admins.webauthn_required = true`) has been satisfied in
  this session. (Enforcement mechanism is TBD — see Open Questions.)
- No existing `public.tenants.slug` collides with the requested slug.

## Trigger

Super admin navigates to `/platform/tenants/new` and submits the "Create practice" form with:
display name, slug, plan (`starter` | `growth` | `enterprise`), region, prospective practice-owner
email, and a BAA acknowledgement checkbox.

## Main Flow

1. Server action `createTenant` re-asserts `is_platform_admin()` against the request's session
   (defense-in-depth; RLS alone is insufficient because `tenants.insert` has no public policy —
   writes must use the service-role client).
2. Action validates payload: slug matches the regex `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`
   (mirrors the CHECK constraint on `public.tenants.slug`); display name is 1–128 chars; region is a
   valid `public.tenant_region`; plan is a valid `public.tenant_plan`.
3. Service-role client inserts into `public.tenants` with `hipaa_baa_signed = false` (the tenant is
   created in a "pre-BAA" state; clinical writes are blocked by the `require_baa_signed()` trigger
   until the owner signs the BAA in-app).
4. In the same transaction, a row is inserted into `public.invitations` scoped to the new
   `tenant_id` with `roles = {'practice_owner'}`, `token_hash = sha256(random_token)`,
   `invited_by = auth.uid()`, `status = 'pending'`, `expires_at = now() + interval '7 days'`.
5. Raw invitation token is handed off to the notification queue (`public.notifications`,
   `channel = 'email'`, `template_key = 'invite.practice_owner'`) so the owner receives a link
   `https://app.vitalflow.com/invitations/accept?token=<raw>`.
6. App-level audit event `admin.entitlement_granted` is logged (`tenantId = <new id>`,
   `actorId = super admin id`, `details = { plan, region, seed_owner_email }`). The row-level
   INSERTs on `tenants` and `invitations` are already captured by `audit.log_change()`.
7. UI redirects to `/platform/tenants/<id>` with a success toast and the raw token displayed once
   (for manual relay if the email provider is down).

## Alternate Flows

### A1. Slug collision

1. At step 3, the INSERT violates the `tenants_slug_key` unique constraint.
2. Action returns `E_CONFLICT`; form re-renders with a field-level error on `slug`. No tenant row,
   no invitation row, no audit event.

### A2. Email provider failure

1. At step 5, the notification insert succeeds but the downstream sender marks the row
   `status = 'failed'`.
2. The tenant and invitation rows remain valid; the UI shows a warning banner with a "Copy invite
   link" action that reads the raw token from the action response.

### A3. BAA checkbox unchecked

1. At step 2, validation rejects the form with `E_VALIDATION`.
2. No DB writes. User must re-submit with the acknowledgement.

## Postconditions

- New row in `public.tenants` with `deleted_at IS NULL`, `hipaa_baa_signed = false`.
- New row in `public.invitations` (`status = 'pending'`) keyed to the new tenant and the seed
  owner's email.
- Two row-level audit events (INSERT on `tenants`, INSERT on `invitations`) plus one APP audit event
  (`admin.entitlement_granted`) visible in `audit.audit_events`.
- A queued row in `public.notifications` for the practice-owner invite.

## Business Rules

- **BR-1.** Only `public.is_platform_admin()` callers may reach this surface. Regular staff —
  including `practice_owner` — must never see `/platform/*`.
- **BR-2.** Tenant is created in pre-BAA state; PHI writes are blocked by `require_baa_signed()` on
  `public.patients` and `public.encounters` until BAA is signed. This is intentional — provisioning
  and onboarding are separate gates.
- **BR-3.** The seed invite MUST grant `roles = {'practice_owner'}`. The `enforce_owner_grant`
  trigger's bootstrap clause (first member can be owner) covers this at acceptance time.
- **BR-4.** Raw invitation tokens are never persisted — only `sha256(token)` lives in
  `invitations.token_hash`. The plaintext token transits once via email and the success toast.

## Exceptions

| Code              | When it happens                                                         | User-facing message                                                |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `E_PERMISSION`    | Caller is not in `platform_admins` or WebAuthn step-up has not been met | "This area is restricted to platform administrators."              |
| `E_VALIDATION`    | Slug regex / length / plan / region / BAA checkbox fails                | Field-level error                                                  |
| `E_CONFLICT`      | Slug already exists (unique violation on `tenants_slug_key`)            | "That URL slug is already in use."                                 |
| `E_NOTIFY_FAILED` | Notification provider rejects the outbound email                        | "Practice created, but invite email failed — copy the link below." |

## Data Model Touchpoints

| Table                    | Writes                                                                                                                     | Reads                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `public.tenants`         | INSERT `id`, `slug`, `display_name`, `plan`, `region`, `hipaa_baa_signed = false`, `metadata`                              | SELECT `slug` for uniqueness check                              |
| `public.invitations`     | INSERT `tenant_id`, `email`, `roles = {'practice_owner'}`, `token_hash`, `invited_by`, `status = 'pending'`, `expires_at`  | —                                                               |
| `public.notifications`   | INSERT `tenant_id`, `recipient_email`, `channel = 'email'`, `template_key`, `template_data`, `status = 'queued'`           | —                                                               |
| `public.platform_admins` | —                                                                                                                          | SELECT `user_id`, `revoked_at` via `public.is_platform_admin()` |
| `audit.audit_events`     | INSERT `event_type = 'admin.entitlement_granted'` via `logEvent()`; plus row-level triggers on `tenants` and `invitations` | —                                                               |

## Permissions Required

| Permission                                                 | Enforced where                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.is_platform_admin()` (not a role-based permission) | Server action `createTenant`, route middleware for `/platform/*`, and any RLS policy that would expose `platform_admins` / cross-tenant data |

_No entry in `packages/auth/src/rbac.ts` maps to super-admin capabilities — super-admin is a
separate gate (`is_platform_admin()` + `platform_admins` table). The `ROLE_PERMISSIONS` map applies
only to per-tenant staff roles. The seed invitation row is inserted via the service-role client,
which bypasses `invitations_rw` RLS by design — no tenant member exists yet to satisfy
`admin:users`, so RBAC cannot apply until UC-A3 completes._

## UX Surface

- **Route:** `/platform/tenants/new` (new route; must live under a `(platform)` route group with
  middleware that checks `is_platform_admin()`).
- **List route:** `/platform/tenants` (index; not in scope for this UC, but the redirect target from
  `/platform/tenants/<id>` lives there).
- **Server action:** `createTenant(formData: FormData)` in
  `apps/web/src/app/(platform)/tenants/new/actions.ts`.
- **Audit event:** `admin.entitlement_granted` (APP) — row-level INSERT events on `public.tenants`
  and `public.invitations` are automatic.
- **Notification template:** `invite.practice_owner` (new key; add to the template registry).

## Test Plan

- **Happy path
  (`uc-a1-super-admin-tenant-create.spec.ts › should create tenant and seed practice-owner invitation`):**
  sign in as a seeded platform admin, POST the new-tenant form, assert redirect to
  `/platform/tenants/<id>`, assert rows in `public.tenants`, `public.invitations`, and
  `audit.audit_events`.
- **Alt path — slug collision
  (`uc-a1-super-admin-tenant-create.spec.ts › should reject duplicate slug with field error`):**
  pre-seed a tenant with slug `acme`; submit again; assert no new rows and a field-level error.
- **Negative — non-platform caller
  (`uc-a1-super-admin-tenant-create.spec.ts › should 404 for non-platform users`):** sign in as
  `practice_owner`; GET `/platform/tenants/new`; assert 404 (middleware should not leak the route's
  existence).
- **Negative — validation
  (`uc-a1-super-admin-tenant-create.spec.ts › should reject invalid slug regex`):** submit slug
  `Acme!`; assert validation error without any DB writes.

## Open Questions

- **OQ-1.** Should tenant creation require email-verified ownership (OTP round-trip) of the seed
  `practice_owner` email before the tenant row is persisted, or is the invitation handoff
  sufficient? The current design creates the tenant unconditionally; a failed/abandoned invite
  leaves an orphan tenant.
- **OQ-2.** WebAuthn step-up is documented as a platform-admin requirement
  (`platform_admins.webauthn_required`), but there is no code path today that enforces it on the web
  client. Do we gate `createTenant` behind a re-auth challenge, or accept session-level MFA at login
  as sufficient for demo?
- **OQ-3.** Should BAA be split into a separate post-create flow (current spec) or gated into tenant
  creation so `hipaa_baa_signed = true` from the start when a pre-signed BAA PDF is uploaded?
- **OQ-4.** The `public.invitations` table has a unique constraint `(tenant_id, email, status)`. If
  the initial invite expires and the super admin re-seeds, the re-insert will collide unless the
  expired row's status is updated first. Do we auto-expire-then-reinvite in this action, or require
  a manual "resend" path?
