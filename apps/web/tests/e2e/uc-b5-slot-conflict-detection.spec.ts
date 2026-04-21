import { expect, test } from "@playwright/test";

/**
 * UC-B5 — Slot-conflict detection on appointment create.
 *
 * Spec: docs/specs/UC-B5-slot-conflict-detection.md
 *
 * Tests are skipped until /api/appointments/busy-time + the client-side
 * day strip + server-side pre-check land. Backstop is the existing
 * `appointments_no_overlap` exclusion constraint — tests must exercise
 * both the friendly path and the race-condition path.
 */

test.describe("UC-B5 slot-conflict detection", () => {
  test.skip("should book appointment when provider has no conflicts", async ({ page }) => {
    await page.goto("/appointments/new");
    await expect(page.getByRole("heading", { name: /New appointment/i })).toBeVisible();
    // TODO: fill patient MRN + provider + date + start_time + 30min duration, submit, assert redirect /appointments/:id
  });

  test.skip("should highlight conflicting slot and disable submit button", async ({ page }) => {
    await page.goto("/appointments/new");
    await expect(page.getByRole("heading", { name: /New appointment/i })).toBeVisible();
    // TODO: seed an appointment for provider X at 10:00-10:30, pick overlapping slot, assert red highlight + disabled [type=submit]
  });

  test.skip("should catch race-condition conflict via server-side recheck", async ({ page }) => {
    await page.goto("/appointments/new");
    await expect(page.getByRole("heading", { name: /New appointment/i })).toBeVisible();
    // TODO: stub busy-time endpoint to return [], insert conflicting row via API fixture, submit, assert error=conflict in URL
  });

  test.skip("should not count cancelled appointments as conflicts", async ({ page }) => {
    await page.goto("/appointments/new");
    await expect(page.getByRole("heading", { name: /New appointment/i })).toBeVisible();
    // TODO: seed status='cancelled' row at 10:00-10:30, book 10:00-10:30 on same provider, assert success
  });

  test.skip("should allow back-to-back appointments (half-open interval)", async ({ page }) => {
    await page.goto("/appointments/new");
    await expect(page.getByRole("heading", { name: /New appointment/i })).toBeVisible();
    // TODO: seed 09:30-10:00, book 10:00-10:30 on same provider, assert success (no conflict, no red highlight)
  });

  test.skip("should block session without schedule:write from loading the form", async ({
    page,
  }) => {
    await page.goto("/appointments/new");
    await expect(page.locator("body")).toBeVisible();
    // TODO: swap to physician-only session (no schedule:write), assert redirect or 403
  });
});
