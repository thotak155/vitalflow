import { expect, test } from "@playwright/test";

/**
 * UC-C7 — Provider picks diagnosis via ICD-10 search.
 *
 * Skeletons only — each test is `.skip`ped until the implementation PR lands
 * the Icd10Picker client component + /api/v1/clinical/icd10 lookup endpoint.
 * The existing `assignDiagnosis` server action is reused, so the skeletons
 * target the existing form's hidden code / description fields.
 *
 * See docs/specs/UC-C7-icd10-diagnosis-picker.md for the full spec + test plan.
 */

const ENCOUNTER_URL = "/encounters/00000000-0000-0000-0000-000000000001";

test.describe("UC-C7 ICD-10 diagnosis picker", () => {
  test.skip("should search by description and add a diagnosis", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("combobox", { name: /Search ICD-10/ })).toBeVisible();
    // TODO: assert postconditions — type "diabetes", select E11.9, submit, expect row in Diagnoses panel at rank 1.
  });

  test.skip("should search by ICD-10 code prefix", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("combobox", { name: /Search ICD-10/ })).toBeVisible();
    // TODO: assert postconditions — type "J02", expect J02.9 in results, select + submit.
  });

  test.skip("should auto-assign rank to max+1", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("combobox", { name: /Search ICD-10/ })).toBeVisible();
    // TODO: assert postconditions — with one existing rank-1 assignment, add second; expect rank 2 without user editing rank input.
  });

  test.skip("should 403 when biller POSTs directly", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page).toHaveURL(/encounters/);
    // TODO: assert postconditions — POST to assignDiagnosis as biller (clinical:read only); expect redirect with forbidden error.
  });

  test.skip("should show No matches empty state", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("combobox", { name: /Search ICD-10/ })).toBeVisible();
    // TODO: assert postconditions — type "qqqzzz", expect "No matches" copy, Add button disabled.
  });

  test.skip("should reject malformed code at server", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page).toHaveURL(/encounters/);
    // TODO: assert postconditions — POST raw form with code=ABC (simulating a tampered client); expect validation-error redirect.
  });
});
