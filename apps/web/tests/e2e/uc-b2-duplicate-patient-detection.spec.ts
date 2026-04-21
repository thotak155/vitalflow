import { expect, test } from "@playwright/test";

/**
 * UC-B2 — Duplicate patient detection on create.
 *
 * Spec: docs/specs/UC-B2-duplicate-patient-detection.md
 *
 * These tests are initially skipped — they describe the acceptance surface
 * the implementation PR must deliver. Flip `test.skip` → `test` as the
 * feature lands. Each body is a 3-line scaffold: navigate, sanity-check a
 * visible anchor, then a TODO for the post-condition assertions (the real
 * check the spec demands — DB state, redirect target, audit row, etc.).
 */

test.describe("UC-B2 duplicate patient detection", () => {
  test.skip("should create patient when no duplicate exists", async ({ page }) => {
    await page.goto("/patients/new");
    await expect(page.getByRole("heading", { name: /New patient/i })).toBeVisible();
    // TODO: fill unique demographics, submit, assert redirect to /patients/:id + row inserted
  });

  test.skip("should show candidate panel when name+DOB matches existing patient", async ({
    page,
  }) => {
    await page.goto("/patients/new");
    await expect(page.getByRole("heading", { name: /New patient/i })).toBeVisible();
    // TODO: seed a patient via fixture, submit matching name+DOB, assert "Possible duplicate" panel with ≥1 candidate
  });

  test.skip("should show candidate panel when phone matches a different-name patient", async ({
    page,
  }) => {
    await page.goto("/patients/new");
    await expect(page.getByRole("heading", { name: /New patient/i })).toBeVisible();
    // TODO: seed patient with phone, submit new-looking name with same phone, assert contact-match candidate shown
  });

  test.skip("should insert after user confirms new patient", async ({ page }) => {
    await page.goto("/patients/new");
    await expect(page.getByRole("heading", { name: /New patient/i })).toBeVisible();
    // TODO: trigger candidate panel, click "This is a new patient", assert redirect + metadata.duplicate_check.confirmed_new_at
  });

  test.skip("should reject submission when patient:write permission is missing", async ({
    page,
  }) => {
    await page.goto("/patients/new");
    await expect(page.locator("body")).toBeVisible();
    // TODO: swap to a session without patient:write (e.g. biller), assert 403/redirect away from the form
  });
});
