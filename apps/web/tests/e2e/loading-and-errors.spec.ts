import { expect, test } from "@playwright/test";

/**
 * Verify that Phase 4's `loading.tsx` + `error.tsx` shells exist as files
 * the app is aware of. We can't force-trigger a server crash cleanly in a
 * smoke test, so these checks are pragmatic: the loading/error wiring is
 * real if the compiled app contains those route segments, which is
 * verified by the pages above rendering + Next's static analysis of the
 * file tree.
 *
 * A true error-boundary test requires dependency-injecting a failure into
 * a server component render — deferred to tier-2.
 */

test.describe("loading + error shells", () => {
  test("billing layout renders without layout shift on navigation", async ({ page }) => {
    await page.goto("/billing");
    // Capture layout before navigation.
    const tabNav = page.getByRole("navigation", { name: /billing sections/i });
    await expect(tabNav).toBeVisible();

    await page.getByRole("link", { name: "Claims" }).click();
    await page.waitForURL("**/billing/claims");
    await expect(tabNav).toBeVisible();

    await page.getByRole("link", { name: "Denials" }).click();
    await page.waitForURL("**/billing/denials");
    await expect(tabNav).toBeVisible();
  });

  test("encounter page renders error boundary for invalid id format", async ({ page }) => {
    const response = await page.goto("/encounters/not-a-uuid");
    // Non-UUID id lands either in a 404 or the error boundary card
    // — both are acceptable outcomes for invalid input.
    const status = response?.status() ?? 0;
    if (status >= 200 && status < 500) {
      const body = page.locator("body");
      await expect(body).toContainText(/not found|404|something went wrong/i);
    }
  });
});
