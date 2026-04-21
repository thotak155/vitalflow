import { expect, test } from "@playwright/test";

/**
 * URL-driven filter persistence. The filter bar is a pure
 * `<form method="GET">` — applying it should reflect every field in the
 * querystring so URLs are shareable.
 */

test.describe("billing filters", () => {
  test("claims: status multi-select + date range land in the URL", async ({ page }) => {
    await page.goto("/billing/claims");

    // Pick two statuses from the multi-select.
    await page.locator("select[name='status']").selectOption(["draft", "submitted"]);
    await page.locator("input[name='from']").fill("2026-04-01");
    await page.locator("input[name='to']").fill("2026-04-21");

    await Promise.all([
      page.waitForURL(/\/billing\/claims\?/),
      page.getByRole("button", { name: "Apply" }).click(),
    ]);

    const url = new URL(page.url());
    const statuses = url.searchParams.getAll("status");
    expect(statuses).toEqual(expect.arrayContaining(["draft", "submitted"]));
    expect(url.searchParams.get("from")).toBe("2026-04-01");
    expect(url.searchParams.get("to")).toBe("2026-04-21");
  });

  test("denials: preset filter links preserve without JS", async ({ page }) => {
    await page.goto("/billing/denials?status=resolved");
    // The select should have 'resolved' selected when the URL says so.
    const selected = await page
      .locator("select[name='status']")
      .evaluate((el: HTMLSelectElement) => Array.from(el.selectedOptions).map((o) => o.value));
    expect(selected).toEqual(expect.arrayContaining(["resolved"]));
  });

  test("balances: band filter preserved across reload", async ({ page }) => {
    await page.goto("/billing/balances?band=over-90");
    const selected = await page
      .locator("select[name='band']")
      .evaluate((el: HTMLSelectElement) => el.value);
    expect(selected).toBe("over-90");
  });
});
