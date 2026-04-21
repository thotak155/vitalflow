import { expect, test } from "@playwright/test";

/**
 * UC-B8 — Patient completes pre-visit intake form.
 *
 * Spec: docs/specs/UC-B8-patient-intake-form.md
 *
 * Tests are skipped until the proposed `public.intake_forms` + `public.intake_submissions`
 * tables, the `/my/intake/[appointmentId]` route, and the staff-visible
 * status chip on `/appointments/[id]` all land. The test runner needs a
 * patient-surface session fixture (user_kind='patient' with a verified
 * patient_portal_links row) which doesn't exist yet — flag in the impl PR.
 */

test.describe("UC-B8 patient intake form", () => {
  test.skip("should allow patient to complete and submit intake form", async ({ page }) => {
    await page.goto("/my/intake/seed-appointment-id");
    await expect(page.getByRole("heading", { name: /Pre-visit intake/i })).toBeVisible();
    // TODO: fill all required schema fields, click Submit, assert intake_submissions.submitted_at is set + notifications row for provider exists
  });

  test.skip("should autosave draft and rehydrate on reload", async ({ page }) => {
    await page.goto("/my/intake/seed-appointment-id");
    await expect(page.getByRole("heading", { name: /Pre-visit intake/i })).toBeVisible();
    // TODO: fill partial answers, wait for autosave, reload page, assert fields prefilled from intake_submissions.answers
  });

  test.skip("should render read-only form for a completed appointment", async ({ page }) => {
    await page.goto("/my/intake/completed-appointment-id");
    await expect(page.getByRole("heading", { name: /Pre-visit intake/i })).toBeVisible();
    // TODO: assert no submit button + "This visit is no longer editable." message
  });

  test.skip("should show no-op message when tenant has no template configured", async ({
    page,
  }) => {
    await page.goto("/my/intake/no-template-appointment-id");
    await expect(page.locator("body")).toBeVisible();
    // TODO: assert "No intake form is required for this visit." message + no form rendered
  });

  test.skip("should surface Submitted status chip on /appointments/[id] after patient submits", async ({
    page,
  }) => {
    await page.goto("/appointments/seed-appointment-id");
    await expect(page.getByRole("heading", { name: /Appointment/i })).toBeVisible();
    // TODO: as staff, assert a Submitted badge is visible + clicking opens read-only answers modal
  });

  test.skip("should 404 when user is linked to a different patient", async ({ page }) => {
    await page.goto("/my/intake/other-patients-appointment-id");
    await expect(page.locator("body")).toBeVisible();
    // TODO: assert response.status() === 404 and no intake_submissions row is ever written
  });
});
