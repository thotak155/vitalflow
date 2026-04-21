import { expect, test } from "@playwright/test";

/**
 * UC-B9 — Patient self-checks in for visit.
 *
 * Spec: docs/specs/UC-B9-patient-self-checkin.md
 *
 * Tests are skipped until `/my/appointments` (currently a ComingSoon stub),
 * the `/my/appointments/[id]/check-in` route, the `appointments.arrived_at`
 * column, and the `public.self_check_in` RPC all land. Like UC-B8, a
 * patient-surface session fixture is required — see the impl PR.
 */

test.describe("UC-B9 patient self check-in", () => {
  test.skip("should check patient in when inside the allowed window", async ({ page }) => {
    await page.goto("/my/appointments/seed-appointment-id/check-in");
    await expect(page.getByRole("heading", { name: /Check in/i })).toBeVisible();
    // TODO: confirm DOB, click "I'm here", assert appointments.status='arrived' + arrived_at set + two notifications rows
  });

  test.skip("should block check-in when the visit is more than 60 minutes away", async ({
    page,
  }) => {
    await page.goto("/my/appointments/too-early-appointment-id/check-in");
    await expect(page.locator("body")).toBeVisible();
    // TODO: assert "Check-in opens at" message + no submit button + appointment.status unchanged
  });

  test.skip("should block check-in when more than 15 minutes past start time", async ({ page }) => {
    await page.goto("/my/appointments/too-late-appointment-id/check-in");
    await expect(page.locator("body")).toBeVisible();
    // TODO: assert "please see the front desk" message + no submit + no DB write
  });

  test.skip("should reject check-in when confirmed DOB does not match", async ({ page }) => {
    await page.goto("/my/appointments/seed-appointment-id/check-in");
    await expect(page.getByRole("heading", { name: /Check in/i })).toBeVisible();
    // TODO: enter wrong DOB, submit, assert identity-mismatch error + failure counter incremented + no status change
  });

  test.skip("should be idempotent when appointment is already arrived", async ({ page }) => {
    await page.goto("/my/appointments/already-arrived-appointment-id/check-in");
    await expect(page.locator("body")).toBeVisible();
    // TODO: assert "You're already checked in." message + no second notifications row inserted
  });

  test.skip("should return 404 when user is linked to a different patient", async ({ page }) => {
    await page.goto("/my/appointments/other-patients-appointment-id/check-in");
    await expect(page.locator("body")).toBeVisible();
    // TODO: assert response.status() === 404 and appointment row is not mutated
  });
});
