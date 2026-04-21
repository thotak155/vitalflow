import { expect, test } from "@playwright/test";

/**
 * UC-C3 — Provider enters SOAP draft manually (outside AI flow).
 *
 * Skeletons only — each test is `.skip`ped until the implementation PR lands
 * the inline "New note" entry point on /encounters/[id]. When the PR flips
 * `.skip` → `test`, the bodies below get real assertions.
 *
 * See docs/specs/UC-C3-manual-soap-entry.md for the full spec + test plan.
 */

const ENCOUNTER_URL = "/encounters/00000000-0000-0000-0000-000000000001";

test.describe("UC-C3 manual SOAP entry", () => {
  test.skip("should let a physician create and save a SOAP draft inline", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: "New note" })).toBeVisible();
    // TODO: assert postconditions — fill SOAP fields, Save draft, expect draft row with ai_assisted=false.
  });

  test.skip("should sign a draft in the same action", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Save \+ Sign/ })).toBeVisible();
    // TODO: assert postconditions — click Save + Sign, provide attestation, expect status=signed and a signatures row.
  });

  test.skip("nurse can save but cannot see the Sign button", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
    // TODO: assert postconditions — sign in as nurse_ma; Save + Sign button must NOT be in DOM.
  });

  test.skip("should 403 when a scheduler POSTs directly", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page).toHaveURL(/encounters/);
    // TODO: assert postconditions — POST to saveNoteDraft as scheduler; expect redirect with forbidden error.
  });

  test.skip("should show Amend instead of New note when a signed note exists", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Amend/ })).toBeVisible();
    // TODO: assert postconditions — seed a signed note; New note must NOT render; only Amend is offered.
  });
});
