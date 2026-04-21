import { expect, test } from "@playwright/test";

/**
 * UC-B3 — Attach insurance card images to coverage.
 *
 * Spec: docs/specs/UC-B3-insurance-card-upload.md
 *
 * Tests are skipped until the coverage-card upload UI + `coverage-cards`
 * Storage bucket + `patient_coverages.card_{front,back}_attachment_id`
 * migration land. Each test has a 3-line scaffold; implementation PR will
 * flip .skip → test and fill in the TODOs.
 */

test.describe("UC-B3 insurance card upload", () => {
  test.skip("should upload front and back card images", async ({ page }) => {
    await page.goto("/patients/seed-patient-id");
    await expect(page.getByRole("heading", { name: /Coverages/i })).toBeVisible();
    // TODO: upload front PNG, upload back PNG, assert two attachments + thumbnails rendered
  });

  test.skip("should soft-delete previous attachment when replacing a card", async ({ page }) => {
    await page.goto("/patients/seed-patient-id");
    await expect(page.getByRole("heading", { name: /Coverages/i })).toBeVisible();
    // TODO: upload initial front, replace with new front, assert old attachments.deleted_at is set + coverage points to new id
  });

  test.skip("should clear card_front_attachment_id when removing a card", async ({ page }) => {
    await page.goto("/patients/seed-patient-id");
    await expect(page.getByRole("heading", { name: /Coverages/i })).toBeVisible();
    // TODO: click Remove on front card, assert coverage.card_front_attachment_id is null + attachment soft-deleted
  });

  test.skip("should accept a PDF upload and render a PDF icon", async ({ page }) => {
    await page.goto("/patients/seed-patient-id");
    await expect(page.getByRole("heading", { name: /Coverages/i })).toBeVisible();
    // TODO: upload application/pdf file, assert attachment row with mime_type='application/pdf' + PDF icon in UI
  });

  test.skip("should reject a 20 MB JPEG with a clear validation message", async ({ page }) => {
    await page.goto("/patients/seed-patient-id");
    await expect(page.getByRole("heading", { name: /Coverages/i })).toBeVisible();
    // TODO: attempt upload > 8 MB, assert inline error "Cards must be JPG, PNG, or PDF and under 8 MB"
  });

  test.skip("should hide Upload button and reject server action for users without patient:write", async ({
    page,
  }) => {
    await page.goto("/patients/seed-patient-id");
    await expect(page.locator("body")).toBeVisible();
    // TODO: swap to biller session, assert no Upload button visible + direct action POST returns 403
  });
});
