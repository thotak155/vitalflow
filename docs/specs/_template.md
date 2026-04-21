# UC-XX — {{Use Case Name}}

> **Status:** Draft · **Group:** {{A/B/C/D}} · **Priority:**
> {{demo-critical | demo-nice-to-have | v1.1}}

## Actors

- _Primary:_ {{Role}}
- _Secondary:_ {{Role}}

## Preconditions

- {{Required system / data state}}

## Trigger

{{What causes this use case to start.}}

## Main Flow

1. {{Step}}
2. {{Step}}
3. {{Step}}

## Alternate Flows

### A1. {{Short name}}

1. _At step N of the main flow,_ {{condition}}
2. {{What happens instead}}

## Postconditions

- {{Resulting system / data state after success}}

## Business Rules

- **BR-1.** _Tenant isolation:_ every read and write scopes by `tenant_id`. Cross-tenant access MUST
  fail via RLS + app guard.
- **BR-2.** _RBAC gate:_ {{required permission}} is enforced at the server action AND at the RLS
  layer.
- **BR-3.** _Audit:_ {{event_type}} fires via `logEvent()` on successful completion.
- **BR-4.** _(surface-specific — /my/\* routes only):_ route is gated on
  `session.userKind === 'patient'`; staff users 404.
- **BR-5.** _(multi-location — scheduling/checkin/routing specs only):_
  {{what the rule is when provider/patient/notification crosses location boundaries}}.
- **BR-N.** {{additional domain-specific rules}}

## Exceptions

| Code           | When it happens                  | User-facing message                 |
| -------------- | -------------------------------- | ----------------------------------- |
| `E_PERMISSION` | Caller lacks required permission | "You don't have access to do this." |
| `E_VALIDATION` | Input failed validation          | Field-level error                   |
| `E_CONFLICT`   | State collision                  | Context-specific                    |

## Data Model Touchpoints

| Table              | Writes      | Reads       |
| ------------------ | ----------- | ----------- |
| `public.{{table}}` | {{columns}} | {{columns}} |

## Permissions Required

| Permission    | Enforced where                        |
| ------------- | ------------------------------------- |
| `{{ns:verb}}` | Server action / page middleware / RLS |

## UX Surface

- **Surface root:** `{{/platform | /admin | / | /my}}` (see docs/specs/README.md)
- **Route:** `{{/path}}`
- **Server action:** `{{fn name}}`
- **Audit event:** `{{event_type}}` — must be in `AUDIT_EVENT_TYPES` in `packages/auth/src/audit.ts`
- **Migration:** `{{supabase/migrations/XXXXXXXXXXXXXX_name.sql}}` (required when Data Model has
  "NEW — proposed" rows)

## Test Plan

- **Happy path:** {{Playwright e2e description}}
- **Alt path:** {{e2e description}}
- **Negative:** {{permission-denied / validation-fail / conflict paths}}

## Open Questions

- {{Explicit ambiguity for a human to resolve before implementation}}
