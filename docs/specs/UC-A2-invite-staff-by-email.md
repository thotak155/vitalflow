# UC-A2 — Practice owner invites staff by email

> **Status:** Draft · **Group:** A (governance) · **Priority:** demo-critical

## Actors

- _Primary:_ Practice Owner or Office Admin (authenticated staff with `admin:users` permission in
  the current tenant).
- _Secondary:_ Invitee (a person not yet in `auth.users` or a staff member not yet a member of this
  tenant) — out-of-band recipient of the invitation email.

## Preconditions

- Caller is signed in and has an active `public.tenant_members` row with a role granting
  `admin:users` (i.e. `practice_owner` or `office_admin` per `ROLE_PERMISSIONS` in
  `packages/auth/src/rbac.ts`).
- Tenant exists (`public.tenants.deleted_at IS NULL`).
- Caller is NOT currently impersonating — `admin:users` is in `IMPERSONATION_BLOCKED` (see
  `packages/auth/src/rbac.ts:110-128`); impersonators cannot invite.
- A notification email provider (Resend or equivalent) is configured in
  `public.integration_connections` for this tenant, or the platform-default sender is available.

## Trigger

Caller navigates to `/admin/members`, enters an email address + picks one or more staff roles on the
"Invite a member" panel, and submits. (This replaces today's "Create member" form that writes
directly to `public.tenant_members`.)

## Main Flow

1. Server action `inviteMember(formData)` calls `getSession()` and
   `requirePermission(session, "admin:users")`.
2. Input is validated: email is RFC-5322-ish and fits `citext`, `roles` is a non-empty subset of
   `public.staff_role`. If `practice_owner` is among the roles, the `enforce_owner_grant` trigger
   will reject the eventual acceptance unless the caller is themselves a `practice_owner` — surface
   this as a pre-check rather than a post-hoc failure.
3. Action generates a 32-byte random token, computes `token_hash = sha256(token)`, and inserts a row
   into `public.invitations` (`tenant_id = session.tenantId`, `email`, `roles`, `token_hash`,
   `invited_by = auth.uid()`, `status = 'pending'`, `expires_at = now() + interval '7 days'`). The
   existing `invitations_rw` RLS policy gates the write on
   `has_permission('admin:users', tenant_id)`.
4. Action enqueues a notification by inserting into `public.notifications` with `tenant_id`,
   `recipient_email`, `channel = 'email'`, `template_key = 'invite.staff'`,
   `template_data = { practice_display_name, inviter_full_name, roles, expires_at, accept_url }`.
   `accept_url` embeds the raw token: `https://app.vitalflow.com/invitations/accept?token=<raw>`.
   The raw token is never persisted in plaintext.
5. App-level audit event `member.invited` is logged via
   `packages/auth/src/audit.ts::logEvent({ eventType: "member.invited", tenantId, actorId, targetTable: "invitations", targetRowId, details: { email, roles } })`.
   The insert on `public.invitations` is also row-level audited by `audit.log_change()`.
6. UI returns to `/admin/members` with a success toast "Invitation sent to <email>".

## Alternate Flows

### A1. Invitee is already a member of this tenant

1. At step 3, before insert, the action queries `public.tenant_members` joined to `public.profiles`
   on `email`.
2. If a non-deleted match exists for `(tenant_id, email)`, the action short-circuits with
   `E_CONFLICT` ("That person is already a member of this practice") and does not write an
   invitation.

### A2. Active invitation already exists for this email

1. The `public.invitations` unique constraint is `(tenant_id, email, status)`. A second pending
   invite to the same email will violate the constraint.
2. Action should detect this case up-front and either (a) surface `E_CONFLICT` with a "Resend
   invite" button, or (b) rotate the token on the existing row and re-enqueue the email. See Open
   Questions.

### A3. Role includes `practice_owner` but caller is only `office_admin`

1. At step 2, pre-check fails with `E_PERMISSION` ("Only a practice owner can invite another
   practice owner"). The database-level `enforce_owner_grant` trigger enforces this at
   member-acceptance time, but surfacing it early prevents a dead-end invite.

### A4. Notification provider down

1. At step 4, the `public.notifications` row is inserted but the downstream sender marks it
   `failed`.
2. The invitation remains valid; the UI surfaces a "Copy invite link" action for out-of-band relay.
   The audit event is still logged.

## Postconditions

- New row in `public.invitations` with `status = 'pending'`, `token_hash = sha256(token)`,
  `expires_at = now() + 7d`, `invited_by = auth.uid()`.
- One row in `public.notifications` (queued or sending).
- Two audit rows in `audit.audit_events`: row-level INSERT on `public.invitations` (via trigger) and
  APP event `member.invited` (via `logEvent()`).
- No row in `public.tenant_members` yet — that happens in UC-A3 (invitation acceptance).

## Business Rules

- **BR-1.** `admin:users` is the only gate. `practice_owner` and `office_admin` both hold it today;
  patient / scheduler / biller must never see the "Invite" form.
- **BR-2.** Raw tokens never persist. Only `token_hash` is stored. If the email is lost, the invite
  must be revoked and re-issued — there is no "retrieve token" path.
- **BR-3.** Impersonators cannot invite. `admin:users` is in `IMPERSONATION_BLOCKED`, and
  `public.has_permission()` strips it mid-impersonation.
- **BR-4.** Invites to grant `practice_owner` require the caller to already be `practice_owner` —
  enforced by `enforce_owner_grant` trigger at the member-row level during acceptance, mirrored by
  pre-flight UI check.
- **BR-5.** Invite lifetime is 7 days (`expires_at = now() + interval '7 days'`); expired rows
  remain for audit but cannot be accepted (UC-A3 checks `expires_at > now()`).

## Exceptions

| Code              | When it happens                                                                                 | User-facing message                                       |
| ----------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `E_PERMISSION`    | Caller lacks `admin:users`, is impersonating, or is inviting `practice_owner` without being one | "You don't have permission to invite members."            |
| `E_VALIDATION`    | Email malformed, `roles` empty, or contains a value outside `public.staff_role`                 | Field-level error                                         |
| `E_CONFLICT`      | Email already a member OR an active pending invitation already exists                           | "That person already has a pending invite or membership." |
| `E_NOTIFY_FAILED` | Notification enqueue failed at the DB level (not downstream send)                               | "Invite created, but the email couldn't be queued."       |

## Data Model Touchpoints

| Table                   | Writes                                                                                                           | Reads                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `public.invitations`    | INSERT `tenant_id`, `email`, `roles`, `token_hash`, `invited_by`, `status = 'pending'`, `expires_at`             | SELECT on `(tenant_id, email, status)` pre-insert to surface A2                                |
| `public.tenant_members` | —                                                                                                                | SELECT `user_id` joined to `public.profiles.email` (via a view or a service-role query) for A1 |
| `public.profiles`       | —                                                                                                                | SELECT `email`, `user_kind` (to detect patient/platform account collisions)                    |
| `public.notifications`  | INSERT `tenant_id`, `recipient_email`, `channel = 'email'`, `template_key`, `template_data`, `status = 'queued'` | —                                                                                              |
| `audit.audit_events`    | INSERT via row trigger on `public.invitations`; INSERT `event_type = 'member.invited'` via `logEvent()`          | —                                                                                              |

## Permissions Required

| Permission    | Enforced where                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin:users` | (a) server action via `requirePermission()`; (b) RLS `invitations_rw` USING/WITH CHECK clause calls `public.has_permission('admin:users', tenant_id)`; (c) client-side `hasPermission()` to hide the "Invite" button |

_Defined for roles `practice_owner` and `office_admin` in `packages/auth/src/rbac.ts`; stripped for
impersonators via `IMPERSONATION_BLOCKED`._

## UX Surface

- **Route:** `/admin/members` (existing page — form replaces the current `createMember` server
  action that directly inserts into `tenant_members`).
- **Server action:** `inviteMember(formData)` in `apps/web/src/app/(app)/admin/members/actions.ts`
  (new file; extract `createMember`/`updateRoles`/`removeMember` from the page at the same time).
- **Audit event:** `member.invited` (APP).
- **Notification template:** `invite.staff`.

## Test Plan

- **Happy path
  (`uc-a2-invite-staff-by-email.spec.ts › should create a pending invitation and queue email`):**
  sign in as practice_owner; fill invite form with new email + roles `{'biller'}`; submit; assert
  row in `public.invitations` with `status = 'pending'`, row in `public.notifications`, and an audit
  event `member.invited`.
- **Alt A1 (`uc-a2-invite-staff-by-email.spec.ts › should reject invite for existing member`):**
  pre-seed a member; submit invite for their email; assert no new invitation row and a conflict
  error banner.
- **Alt A2 (`uc-a2-invite-staff-by-email.spec.ts › should reject duplicate pending invitation`):**
  invite the same email twice; second request surfaces conflict.
- **Alt A3
  (`uc-a2-invite-staff-by-email.spec.ts › should block office_admin from inviting practice_owner`):**
  sign in as office_admin; attempt invite with roles `{'practice_owner'}`; assert permission error
  and no invitation row.
- **Negative
  (`uc-a2-invite-staff-by-email.spec.ts › should hide invite form for users without admin:users`):**
  sign in as `scheduler`; GET `/admin/members`; assert the page either 403s or renders without the
  Invite panel.

## Open Questions

- **OQ-1.** When an email already has a `pending` invitation for the tenant (unique constraint
  `(tenant_id, email, status)`), should this action (a) return a conflict error and require the
  caller to go to a "Resend" button, or (b) transparently rotate the token on the existing row and
  re-enqueue the email? Option (b) needs explicit UX — the old email link stops working silently.
- **OQ-2.** Should the invite email display the roles being granted? Showing them is friendlier but
  adds risk if the message is forwarded (reveals practice org structure). Recommend yes for demo,
  gate behind a tenant setting post-v1.
- **OQ-3.** Do we enforce domain allow-listing per tenant (e.g.
  `tenant_settings.allowed_invite_domains`)? The current schema has no such column; add it or leave
  as manual review?
- **OQ-4.** When `invited_by` user is deleted (`auth.users` cascade sets FK via
  `references auth.users(id)`), `invitations.invited_by` becomes invalid — the column has no
  `ON DELETE SET NULL`. Should we soft-handle this, or block auth-user deletion while pending
  invites reference them?
