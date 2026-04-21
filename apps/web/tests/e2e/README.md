# VitalFlow web — E2E tests

Two tiers. Tier 1 runs today; tier 2 needs test-database infra that isn't wired yet.

## Tier 1 — smoke tests (this suite)

Proves the app boots, routes resolve, permission-gated surfaces render for a known dev session,
filters persist to URL, 404s don't crash.

### Running

```bash
cd apps/web
pnpm exec playwright install  # first time only — downloads browsers
pnpm test:e2e
```

### How it works

- `playwright.config.ts` boots `next dev` with `VITALFLOW_DEV_SESSION=true`.
- `src/lib/session.ts`'s dev-session stub returns a practice_owner + physician context with all
  their derived permissions.
- Tests hit `http://localhost:3000` and assert on rendered markup.
- **No DB writes** — tests only read. Nothing to clean up.

### What these tests catch

- Server-component render exceptions (pages that throw on DB errors, type mismatches from schema
  drift, etc.)
- Missing permission checks surfacing pages to users who shouldn't see them
- Broken navigation between billing sub-routes
- Filter-bar URL round-tripping
- 404 handling for invalid IDs

### What they don't catch

- State-transition workflows (charge post → claim create → submit → denial → resolve)
- Permission refusals (session without billing:write tries to mark a claim ready)
- Cross-tenant RLS isolation (tenant A cannot read tenant B's rows)
- Impersonation strip-set enforcement

Those need per-test DB fixtures. See tier 2.

---

## Tier 2 — workflow tests (not yet wired)

Full E2E with real state transitions. Requires dedicated test infrastructure:

### What's needed

1. **Separate Supabase test project** (or a test branch of the prod project). Migrations applied.
   Never points at prod.

2. **Seed script** that provisions before each test:
   - A demo tenant with a known UUID
   - 2–3 staff users with varying role combinations (practice_owner, biller, physician, nurse_ma)
   - A 2nd tenant with one user (for cross-tenant isolation tests)
   - Sample patient + encounter data
   - A posted claim + one denial + one payment

3. **Per-test cleanup** — either:
   - Transaction rollback (Supabase doesn't natively support this from the client, so not trivial)
   - Tenant-scoped `DELETE` by `tenant_id` between tests
   - A dedicated test schema recreated per suite run

4. **Session injection per test** — instead of the fixed dev-session stub, tests need to impersonate
   different users. Two options:
   - Extend `session.ts` to read `VITALFLOW_TEST_SESSION` from a request header (set by Playwright
     `extraHTTPHeaders`) — cleanest.
   - Real Supabase auth with known test-user credentials — closer to production behavior but slower.

5. **Playwright fixtures** — one fixture per user role, each returning an authenticated `page` ready
   to drive workflows.

### Tier-2 tests that should exist once infra is in place

- **`charge-capture-workflow.spec.ts`** — physician captures draft charges → posts → patient A/R
  updates
- **`claim-lifecycle.spec.ts`** — biller creates claim from posted charges → marks ready → submit
  throws INTEGRATION_NOT_CONFIGURED → appeal → close
- **`denial-workflow.spec.ts`** — assign to me → record work note → resolve with recovered amount
- **`denial-writeoff-permission.spec.ts`** — biller without `billing:write_off` cannot see / cannot
  submit the write-off form
- **`rls-cross-tenant.spec.ts`** — tenant A's biller sees only tenant A's claims; verifies RLS
  enforcement at the SQL layer
- **`impersonation-block.spec.ts`** — impersonating session cannot mutate clinical/billing state
  (Phase 1's widened strip set in action)
- **`ai-scribe-pipeline.spec.ts`** — submit transcript → session flips to `generating` →
  orchestrator runs → session arrives at `awaiting_review` (needs an `ANTHROPIC_API_KEY` or a mocked
  AIProvider)

---

## Known limits

- `webServer.command = "pnpm dev"` — slower cold start than `next start`. CI should pre-build and
  run `pnpm start` instead.
- Single worker (`workers: 1`). Once test fixtures are isolated by tenant, parallel workers become
  safe.
- Tier-1 tests assume the dev-session tenant UUID exists in the connected DB. If queries return
  empty results, that's fine (empty states render); if the tenant row is missing entirely, some
  queries will 404 — harmless for smoke tests but worth noting.
