import { expect, test } from "@playwright/test";

/**
 * Navigation + permission smoke.
 *
 * The dev-session stub carries practice_owner + physician roles, which
 * includes `billing:read` + `clinical:read`. These tests verify that the
 * app's permission-gated surfaces render for that session.
 *
 * Permission-refusal tests (session WITHOUT billing:read redirected away
 * from /billing) need per-test session injection — see tests/e2e/README.md
 * for the tier-2 plan.
 */

test.describe("navigation + permissions", () => {
  test("root dashboard renders for dev session", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
  });

  test("sidebar exposes the Billing section for a billing:read session", async ({ page }) => {
    await page.goto("/");
    // Sidebar is a client component — let it hydrate.
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: /Claims/i }).first()).toBeVisible();
  });

  test("404 for unknown encounter id does not crash", async ({ page }) => {
    const response = await page.goto("/encounters/99999999-9999-4999-8999-999999999999");
    // Next renders the 404 page with a 404 status.
    expect([404, 200]).toContain(response?.status() ?? 0);
    await expect(page.locator("body")).toContainText(/not found|404/i);
  });

  test("404 for unknown claim id does not crash", async ({ page }) => {
    const response = await page.goto("/billing/claims/99999999-9999-4999-8999-999999999999");
    expect([404, 200]).toContain(response?.status() ?? 0);
    await expect(page.locator("body")).toContainText(/not found|404/i);
  });
});
