import { expect, test } from "@playwright/test";

/**
 * UC-A1 — Super-admin creates a new tenant / practice
 *
 * Spec: docs/specs/UC-A1-super-admin-tenant-create.md
 *
 * These tests are .skip until the `/platform/tenants/new` route ships and the
 * dev-session stub can be switched to a `platform` user_kind with a seeded
 * `public.platform_admins` row. Implementation PR will flip .skip → .test and
 * add DB-seed fixtures for platform-admin identity + unique slug generation.
 */

test.describe("UC-A1 · super-admin tenant creation", () => {
  test.skip("should create tenant and seed practice-owner invitation", async ({ page }) => {
    await page.goto("/platform/tenants/new");
    await expect(page.getByRole("heading", { name: /create a practice/i })).toBeVisible();
    // TODO: assert postconditions — tenant row exists, invitation row pending,
    // audit event admin.entitlement_granted present, redirect to /platform/tenants/<id>.
  });

  test.skip("should reject duplicate slug with field error", async ({ page }) => {
    await page.goto("/platform/tenants/new");
    await expect(page.getByLabel(/slug/i)).toBeVisible();
    // TODO: assert postconditions — no new tenant row, field-level error visible.
  });

  test.skip("should 404 for non-platform users", async ({ page }) => {
    const response = await page.goto("/platform/tenants/new");
    expect(response?.status()).toBe(404);
    // TODO: assert postconditions — no platform_admins lookup leakage.
  });

  test.skip("should reject invalid slug regex", async ({ page }) => {
    await page.goto("/platform/tenants/new");
    await expect(page.getByRole("button", { name: /create/i })).toBeVisible();
    // TODO: assert postconditions — validation error on slug, no DB write.
  });
});
