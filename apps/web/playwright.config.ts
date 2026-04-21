import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for @vitalflow/web.
 *
 * Tier-1 smoke tests (this suite) run against a locally-booted `next dev`
 * with `VITALFLOW_DEV_SESSION=true` — the dev-session stub in
 * `src/lib/session.ts` short-circuits Supabase auth and returns a
 * practice_owner + physician context. Tests verify routing, permission
 * gates that derive from the stub session, and that pages don't throw
 * on render.
 *
 * Tier-2 tests (permission refusals, cross-tenant RLS, state-transition
 * flows) need a dedicated test Supabase project with seeded fixtures — see
 * tests/e2e/README.md. Not yet wired.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITALFLOW_DEV_SESSION: "true",
      // Dev-session stub uses dummy tenant/user IDs. Real Supabase creds are
      // still needed because server components query the DB; the stub tenant
      // must exist in the target DB for reads to succeed. Override via
      // `.env.test.local` or export NEXT_PUBLIC_SUPABASE_URL etc. inline.
    },
  },
});
