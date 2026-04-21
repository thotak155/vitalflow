# VitalFlow V1 — Claims dashboard + Denial queue + Balances

Day-to-day surface for billers, office admins, and practice owners. Turns the charge + claim +
denial + balance data from [billing-rcm.md](billing-rcm.md) into a work-ready dashboard.

See also:

- [docs/billing-rcm.md](billing-rcm.md) — underlying domain and state machines
- [docs/charge-capture.md](charge-capture.md) — where charges originate
- [docs/permissions-matrix.md](permissions-matrix.md) — `billing:*`

---

## 1. Pages and routes

All under `apps/web/src/app/(app)/billing/`. Every page is a Server Component; state lives in the
URL (querystring-driven filters + pagination).

```
/billing                              → redirects to /billing/claims
├── /billing/claims                   Claims list (filters + pagination)
├── /billing/claims/[id]              Claim detail
├── /billing/denials                  Denial work queue
├── /billing/denials/[id]             Denial detail
└── /billing/balances                 Patient balances (aging dashboard)
```

Not in V1: `/billing/payments`, `/billing/remittance`.

---

## 2. Table columns

**Claims list** — 9 columns: Claim #, Patient, Payer, Status, Service dates, Total, Paid, Pat Resp,
Last activity. Default sort `updated_at desc`.

**Denial queue** — Priority (★1–5), Claim #, Codes (chips), Amount, Age (days), Status, Assignee,
Created. Default sort `priority asc, created_at asc`; default filter `status in ('open','working')`.

**Balances** — Patient, Current, 0–30, 31–60, 61–90, 90+, Last payment, Last statement. Default sort
`aging_over_90_minor desc`; over-90 > 0 cells rendered red.

---

## 3. Filters

URL-driven (`<form method="GET">`, no client JS).

- **Claims:** status (multi), payer, provider, service date from/to, free-text q, page
- **Denials:** status (multi, default open+working), assignee (me/unassigned/any/specific),
  priority, free-text code, page
- **Balances:** aging band (all/0-30/31-60/61-90/90+), min balance, free-text patient search, page

---

## 4. Status badges

Single `<StatusBadge>` primitive mapping enum to semantic tone:

| Status                               | Tone        |
| ------------------------------------ | ----------- |
| Claims: draft, closed                | muted       |
| Claims: submitted, partial, appealed | warning     |
| Claims: ready, accepted              | info        |
| Claims: paid                         | success     |
| Claims: rejected, denied             | destructive |
| Denials: open                        | destructive |
| Denials: working, appealed           | warning     |
| Denials: resolved                    | success     |
| Denials: written_off, uncollectable  | muted       |

---

## 5. Detail layouts

**Claim detail** — header (claim #, status badge, totals) → two-column (patient+payer+provider /
perm-gated action buttons) → claim lines table → linked denials mini-list → status history timeline.

**Denial detail** — header (codes, amount, priority, age, status) → claim context + assignment panel
→ reason → append-only work log → action panel (Resolve, Appeal, Write off).

---

## 6. Action model

All writes are Server Actions with POST-redirect-GET (matches encounter workspace pattern). Every
action: session + permission check → admin SQL write → `revalidatePath` → `redirect` with `?ok=` or
`?error=`.

| Action                        | File               | Perm              | Audit event                                        |
| ----------------------------- | ------------------ | ----------------- | -------------------------------------------------- |
| `markClaimReady`              | claims/actions.ts  | billing:write     | `claim.status_changed`                             |
| `submitClaim`                 | same               | billing:write     | banner "clearinghouse not wired" (501-equiv)       |
| `applyRemittance`             | same               | billing:write     | `claim.status_changed` + per-line `denial.created` |
| `appealClaim`                 | same               | billing:write     | `claim.appealed`                                   |
| `closeClaim`                  | same               | billing:write     | `claim.status_changed`                             |
| `assignDenial` / `assignToMe` | denials/actions.ts | billing:write     | `denial.assigned`                                  |
| `recordDenialWork`            | same               | billing:write     | row-level audit only                               |
| `resolveDenial`               | same               | billing:write     | `denial.resolved`                                  |
| `writeOffDenial`              | same               | billing:write_off | `write_off.applied` + `denial.resolved`            |
| `appealDenial`                | same               | billing:write     | status change via row-level audit                  |

`submitClaim` + `applyRemittance` are the two **clearinghouse-bound** actions that return a "not
wired" banner in V1. Everything else is fully functional.

---

## 7. Permissions

| Surface                | Required                     |
| ---------------------- | ---------------------------- |
| `/billing/**`          | `billing:read` (layout gate) |
| Mutating claim actions | `billing:write`              |
| Write-off              | `billing:write_off`          |
| Top-nav "Billing" link | `billing:read`               |

Physicians, nurses, schedulers: no access. Billers, office admins, practice owners: full access.
Impersonation strips `billing:adjust` and `billing:write_off` (write-off buttons disabled for
impersonators).

---

## 8. Empty / loading / error states

**Empty** — copy tuned to filter context:

- Claims (no filters): "No claims yet. Create one from Charge Capture on an encounter."
- Claims (filters): "No claims match these filters. [Clear]"
- Denials (default): "No open denials. Nicely done."
- Denials (custom): "No denials match these filters."
- Balances: "No patients with outstanding balances."

**Loading** — no skeleton UI in V1 (SSR + `force-dynamic` renders inline). Browser navigation bar
handles transitions.

**Error** — two layers: per-page `?error=…` banner from failed actions; default Next.js `error.tsx`
for unhandled server errors (V1 acceptable).

---

## 9. Acceptance criteria

- [ ] `/billing` redirects to `/billing/claims`.
- [ ] User with `billing:read` sees all four pages; user without is 403-redirected from the layout.
- [ ] Claims list renders with default sort `updated_at desc`.
- [ ] Claim status filter applies via querystring; URL is shareable.
- [ ] Claim detail shows header, patient, payer, lines, status-history timeline.
- [ ] `Mark ready` button visible only when `status=draft` + `billing:write`; action transitions to
      `ready` and inserts history row.
- [ ] `Submit` returns a 501-equivalent banner (clearinghouse not wired).
- [ ] `Appeal` form requires reason ≥ 5 chars; transitions status; emits `claim.appealed`.
- [ ] Denial queue default shows `open` + `working`, sorted priority asc + created asc.
- [ ] Age column shows days since created; red when > 30.
- [ ] `Assign to me` sets `assigned_to` and `assigned_at`; emits `denial.assigned`.
- [ ] `Record work` is append-only (adds a dated block to `work_note`).
- [ ] `Resolve` transitions status; emits `denial.resolved`.
- [ ] `Write off` refused without `billing:write_off`.
- [ ] Balances page sorts by `aging_over_90_minor desc` by default; 90+ cells red when > 0.
- [ ] All filter forms are `<form method="GET">` — no client JS.
- [ ] Monorepo typecheck passes; no `"use client"` introduced.

---

## 10. Not V1

- Payments list + record-payment UI (service exists in 5A; UI deferred).
- Real 835 upload + parse (clearinghouse seam only).
- Statement generation (prerequisite for the `last_statement_at` column).
- Payment-plan / autopay.
- Collections workflow (dunning).
- Denial rule engine + auto-assignment.
- CSV export.
- Cross-tenant dashboard (super-admin).

---

## 11. Overview dashboard

`/billing` is the overview. "Overview" is the first tab; the old redirect to `/billing/claims` is
gone.

### 11.1 Layout

```
┌─ filter bar: date range + provider ─────────────────┐
├─ KPI row:  Charges posted · Open denials · Patient A/R · Claims in range │
├─ Panels row 1: Claims by status  |  Aging snapshot │
└─ Panels row 2: Recent payments   |  Denial priority breakdown │
```

Two columns at ≥ md, stacked at sm. All Server Components; the filter bar is a
`<form method="GET">`.

### 11.2 KPIs + sources

| #   | KPI                                                 | Source table                                              | Filter-aware       |
| --- | --------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| 1   | Charges posted (count + total)                      | `public.charges` (status ≠ voided, service_date in range) | yes                |
| 2   | Open denials (count + amount + priority≤2 + age>30) | `public.denials` (status in open/working)                 | no (point-in-time) |
| 3   | Patient A/R (sum + count)                           | `public.patient_balances` (current > 0)                   | no (cumulative)    |
| 4   | Claims in range (count)                             | `public.claims` (service_start_date in range)             | yes                |
| 5   | Claims by status (row 2)                            | same as #4, grouped by status                             | yes                |
| 6   | Aging snapshot (row 2)                              | sums of aging buckets on `public.patient_balances`        | no                 |
| 7   | Recent payments (row 3)                             | top 8 from `public.payments` joined to patient + payer    | yes                |
| 8   | Denial priority breakdown (row 3)                   | grouped by priority, status in open/working               | no                 |

All eight queries run in parallel. Each panel's fetcher is fail-soft — one bad query doesn't crash
the dashboard.

### 11.3 Filters

Date range (`from`, `to`) + provider (`provider`). Presets via `?range=today|7d|30d|mtd`. Defaults
to today.

Flow metrics (charges, claims, payments) respect filters. State metrics (denials, A/R, aging,
priority) are always point-in-time.

### 11.4 Drill-downs

- Status bars → `/billing/claims?status=X&from=&to=&provider=`
- Aging buckets → `/billing/balances?band=X`
- "Open denials" card → `/billing/denials`
- "Patient A/R" card → `/billing/balances`
- Recent payments → _(no payments list UI yet — follow-up)_

### 11.5 Acceptance

- [ ] `/billing` renders the overview (no redirect).
- [ ] Four KPI cards render with accurate counts for seeded data.
- [ ] Status bar click → `/billing/claims?status=X` with preserved range + provider.
- [ ] Aging bucket click → `/billing/balances?band=X`.
- [ ] Recent payments shows up to 8 rows sorted by received_at desc.
- [ ] Zero-data tenant renders cleanly with empty-state copy per panel.
- [ ] Filter is a `<form method="GET">` (no JS).
- [ ] Typecheck + build pass; no `"use client"` introduced.
