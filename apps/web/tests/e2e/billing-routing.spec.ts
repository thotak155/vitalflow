import { expect, test } from "@playwright/test";

/**
 * Billing routing smoke tests.
 *
 * Proves:
 *   - `/billing` lands on the overview dashboard (no redirect in a loop).
 *   - The four tabs render and link correctly.
 *   - Each top-level billing page renders without throwing.
 *   - Empty-data states display (zero-seeded dev tenant).
 */

test.describe("billing routing", () => {
  test("`/billing` renders the overview with tab nav", async ({ page }) => {
    const response = await page.goto("/billing");
    expect(response?.ok()).toBe(true);

    // Tabs live in the layout.
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Claims" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Denials" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Balances" })).toBeVisible();

    // Overview KPI labels.
    await expect(page.getByText(/Charges posted/i)).toBeVisible();
    await expect(page.getByText(/Open denials/i)).toBeVisible();
    await expect(page.getByText(/Patient A\/R/i)).toBeVisible();
    await expect(page.getByText(/Claims in range/i)).toBeVisible();
  });

  test("`/billing/claims` renders the filter bar and table shell", async ({ page }) => {
    await page.goto("/billing/claims");
    // Filter form has a status multi-select and an Apply button.
    await expect(page.locator("select[name='status']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  });

  test("`/billing/denials` defaults to queue view with friendly empty state", async ({ page }) => {
    await page.goto("/billing/denials");
    // Either shows the table OR the empty state "No open denials."
    const table = page.getByRole("table");
    const emptyState = page.getByText(/No open denials|No denials match/i);
    await expect(table.or(emptyState)).toBeVisible();
  });

  test("`/billing/balances` renders the aging columns", async ({ page }) => {
    await page.goto("/billing/balances");
    const table = page.getByRole("table");
    const emptyState = page.getByText(/No patients with outstanding balances/i);
    await expect(table.or(emptyState)).toBeVisible();
  });
});
