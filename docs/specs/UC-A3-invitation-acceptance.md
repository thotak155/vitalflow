# UC-A3 — Staff accepts invitation and sets password

> **Status:** Draft · **Group:** A (governance) · **Priority:** demo-critical

## Actors

- _Primary:_ Invited user — not yet in `auth.users`, or exists there but not a member of the
  inviting tenant. Pre-authenticated: they arrive with only the `token` query parameter.
- _Secondary:_ Inviting Practice Owner / Office Admin (UC-A2 upstream; no live role here).

## Preconditions

- A row exists in `public.invitations` with `status = 'pending'` and `expires_at > now()` whose
  `token_hash = sha256(token)` matches the query param.
- `public.tenants.deleted_at IS NULL` for the row's `tenant_id`.
- The invite is for a staff account (`user_kind = 'staff'`); patient portal linkage is a different
  flow.

## Trigger

User clicks the link from the invite email:
`https://app.vitalflow.com/invitations/accept?token=<raw>`. The route is public (no auth
middleware).

## Main Flow

1. Route `/invitations/accept` (new, inside `apps/web/src/app/(auth)/invitations/accept/page.tsx` by
   analogy with the existing `(auth)/set-password/page.tsx`) receives `?token=`.
2. Page uses the service-role client (the caller is unauthenticated — normal RLS does not apply) to
   look up the invitation by `token_hash = encode(digest(:token, 'sha256'), 'hex')`. If missing,
   expired, revoked, or already accepted, render the error variant with an `E_INVITE_INVALID`
   message.
3. Page renders a form with: full name (prefilled if the invitee is a returning user whose
   `public.profiles.full_name` is set), password, confirm password. The invitee's email is read-only
   and taken from `invitations.email`.
4. On submit, server action `acceptInvitation(formData)` re-validates the token, then:
   - Validates password length ≥ 12 and password === confirm (mirrors
     `(auth)/set-password/page.tsx`).
   - If `auth.users.email` already has a row matching `invitations.email`, attach the existing user
     to the tenant without creating a new auth identity. Otherwise, call
     `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, user_kind: 'staff' } })`.
     The `handle_new_user` trigger (from
     `supabase/migrations/20260416000014_rbac_redesign.sql:67-91`) seeds `public.profiles` with
     `user_kind = 'staff'`.
   - Insert `public.tenant_members` (`tenant_id = invitations.tenant_id`, `user_id = <auth id>`,
     `roles = invitations.roles`, `status = 'active'`, `invited_by = invitations.invited_by`). The
     `enforce_staff_membership` trigger validates `user_kind = 'staff'`; `enforce_owner_grant`
     validates the owner-grant invariant.
   - UPDATE `public.invitations` SET `status = 'accepted'`, `accepted_at = now()` WHERE
     `id = <invite id>`.
   - Call `supabase.auth.signInWithPassword({ email, password })` (or
     `admin.auth.admin.generateLink({ type: 'magiclink' })` — TBD, see Open Questions) to produce a
     session cookie.
5. App-level audit event `member.invite_accepted` is logged (`tenantId`, `actorId = <new user id>`,
   `targetTable = 'invitations'`, `targetRowId`). Row-level triggers on `tenant_members` and
   `invitations` produce additional audit rows.
6. Redirect to `/` (tenant-aware landing page).

## Alternate Flows

### A1. Token invalid / expired / revoked / already accepted

1. At step 2, the invitation row is missing, `status != 'pending'`, or `expires_at <= now()`.
2. Render the error variant with a clear message and a link to `/login`. No writes, no audit event
   (apart from a best-effort `auth.login_failed` with `reason = 'invite_invalid'`? — see Open
   Questions).

### A2. Email already has an `auth.users` row (existing staff joining a second tenant)

1. At step 4, `admin.auth.admin.listUsers({ email })` returns a match.
2. Skip `createUser`. Use the existing user id. Do NOT update their password (they already have
   credentials). If `password` was submitted, ignore it (or refuse with a dedicated message — see
   OQ-3).
3. Proceed to insert `tenant_members` and mark the invite accepted.

### A3. `roles` includes `practice_owner` and tenant already has an owner

1. At step 4, the `tenant_members` INSERT trips `enforce_owner_grant` (the trigger's bootstrap
   clause no longer applies).
2. Transaction rolls back. Show `E_CONFLICT` with "This invitation grants practice owner, which
   requires approval from an existing owner. Please contact support."

### A4. Password confirmation mismatch

1. At step 4 validation, password !== confirm.
2. Re-render the form with `E_VALIDATION`. Invitation row is NOT yet mutated.

## Postconditions

- New or existing `auth.users` row, new `public.profiles` row (via `handle_new_user` trigger) with
  `user_kind = 'staff'`.
- New `public.tenant_members` row, `deleted_at IS NULL`, `status = 'active'`.
- `public.invitations` row has `status = 'accepted'`, `accepted_at = now()`.
- Browser has an authenticated Supabase session cookie for the new user.
- Audit events: row-level INSERTs on `tenant_members` and UPDATE on `invitations`, plus APP event
  `member.invite_accepted`.

## Business Rules

- **BR-1.** The route is public (no auth middleware) — `/invitations/accept` sits under `(auth)`
  layout so it uses the same marketing chrome as `/set-password` and `/login`.
- **BR-2.** Token uniqueness is assumed (32-byte random, hash compared). Collisions are negligible;
  if the hash matches multiple rows, treat as `E_INVITE_INVALID` and log a warning.
- **BR-3.** The action must be idempotent on repeat submissions: once `status = 'accepted'`, any
  further POST with the same token is rejected.
- **BR-4.** Password never leaves the server process in logs. Mirror `(auth)/set-password/page.tsx`
  which uses `redirect()` with `error` query strings but never echoes the password.
- **BR-5.** `user_kind` on the new profile MUST be `'staff'` — the `enforce_staff_membership`
  trigger blocks `tenant_members` inserts for non-staff kinds.
- **BR-6.** If the invitation was for an existing `patient` or `platform` user (same email,
  different `user_kind`), acceptance MUST NOT flip their `user_kind` — instead, return `E_CONFLICT`.
  A patient portal account and a staff account with the same email need separate identities today.
  (OQ-2.)

## Exceptions

| Code               | When it happens                                                                                     | User-facing message                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `E_INVITE_INVALID` | Token not found, expired, revoked, or already accepted                                              | "This invitation link is no longer valid. Ask your administrator for a new one." |
| `E_VALIDATION`     | Password < 12 chars, passwords don't match, full name blank                                         | Field-level error                                                                |
| `E_CONFLICT`       | `practice_owner` grant rejected by `enforce_owner_grant`; or same email is already a non-staff kind | "This invitation can't be accepted — contact your practice administrator."       |
| `E_AUTH`           | Supabase auth user creation or sign-in failed                                                       | "Couldn't finish setup — try again in a moment."                                 |

## Data Model Touchpoints

| Table                   | Writes                                                                                                                        | Reads                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `public.invitations`    | UPDATE `status = 'accepted'`, `accepted_at = now()` WHERE `id = ?`                                                            | SELECT by `token_hash`, check `status`, `expires_at`, fetch `tenant_id`, `email`, `roles`, `invited_by` |
| `auth.users`            | INSERT via `admin.auth.admin.createUser` (new users only)                                                                     | SELECT by email to detect existing users                                                                |
| `public.profiles`       | INSERT via `handle_new_user` trigger (new users only); `user_kind = 'staff'`                                                  | SELECT `user_kind` for existing-user reuse check                                                        |
| `public.tenant_members` | INSERT `tenant_id`, `user_id`, `roles` (from invitation), `status = 'active'`, `invited_by`                                   | —                                                                                                       |
| `audit.audit_events`    | Row-level INSERT / UPDATE triggers on `tenant_members` and `invitations`; APP event `member.invite_accepted` via `logEvent()` | —                                                                                                       |

## Permissions Required

| Permission | Enforced where                                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(none)_   | The route is pre-authentication. Authorisation is established by possession of a valid, unexpired, unrevoked, unaccepted `invitations.token_hash` match — not by any RBAC permission. All DB writes go through the service-role client. |

_The caller has no session during step 2–3; `packages/auth/src/rbac.ts` does not apply.
Post-acceptance, the new session's roles are computed from `public.tenant_members.roles` on the next
request via `public.has_permission()`._

## UX Surface

- **Route:** `/invitations/accept?token=<raw>` — new page in
  `apps/web/src/app/(auth)/invitations/accept/page.tsx`. Public (no middleware auth redirect).
- **Server action:** `acceptInvitation(formData)` co-located (follows the pattern in
  `(auth)/set-password/page.tsx`).
- **Audit event:** `member.invite_accepted` (APP).
- **Prior art:** `apps/web/src/app/(auth)/set-password/page.tsx` — reuse its form chrome,
  `FormField` + `Input` + error banner.

## Test Plan

- **Happy path
  (`uc-a3-invitation-acceptance.spec.ts › should accept invitation, create user, and redirect to /`):**
  seed `public.invitations` with a known token, visit `/invitations/accept?token=<raw>`, submit
  password; assert redirect to `/`, assert `tenant_members` row exists,
  `invitations.status = 'accepted'`, audit event present.
- **Alt A1 (`uc-a3-invitation-acceptance.spec.ts › should reject expired token`):** seed invite with
  `expires_at = now() - 1 day`; assert error page and no DB mutation.
- **Alt A1b (`uc-a3-invitation-acceptance.spec.ts › should reject already-accepted token`):** seed
  invite with `status = 'accepted'`; assert error page.
- **Alt A2
  (`uc-a3-invitation-acceptance.spec.ts › should attach existing auth user without recreating`):**
  seed `auth.users` row for the invite email; submit; assert no duplicate user created,
  `tenant_members` row inserted.
- **Alt A4 (`uc-a3-invitation-acceptance.spec.ts › should reject password mismatch`):** submit
  mismatched passwords; assert form re-renders with error and no mutation.

## Open Questions

- **OQ-1.** Session establishment: after acceptance, do we call `signInWithPassword` (simple but
  reuses the just-submitted password) or issue a Supabase magic-link-style session via
  `admin.auth.admin.generateLink`? `signInWithPassword` is simpler but means a second round-trip;
  the magic-link approach gives us an atomic "accept + sign in" but relies on Supabase internal
  APIs.
- **OQ-2.** If the invitee's email is already in `auth.users` with `user_kind = 'patient'` (they
  were a portal user first), do we (a) refuse the invite with a clear "this email is already a
  patient account — use a different email for staff access" message, (b) prompt them to log in to
  their patient account and add a separate staff login, or (c) allow a single auth identity to span
  both `staff` and `patient` kinds (requires schema change)? Current schema assumes one `user_kind`
  per profile.
- **OQ-3.** When an existing staff user accepts (A2), the form still shows a password field — the
  submitted password is discarded. Do we hide the password fields for existing users (requires a
  `HEAD` probe at page load) or keep the consistent form and silently ignore?
- **OQ-4.** Should the audit for an invalid / expired token still fire (as `auth.login_failed` with
  `reason = 'invite_invalid'`), or do we stay silent to avoid leaking invite-email enumeration to
  unauthenticated callers?
