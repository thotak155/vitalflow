import { expect, test } from "@playwright/test";

/**
 * UC-A8 — Admin reads audit events
 *
 * Spec: docs/specs/UC-A8-audit-log-reader.md
 *
 * /admin/security is currently a ComingSoon stub. These tests target the real
 * page once it renders audit.audit_events. Keep skipped until the audit table
 * schema drift is resolved (see spec OQ-1 re: event_type column) and the page
 * ships. Impersonator column requires seeding an audit row with
 * impersonator_id set.
 */

test.describe("UC-A8 · audit log reader", () => {
  test.skip("should list recent audit events for the current tenant", async ({ page }) => {
    await page.goto("/admin/security");
    await expect(page.getByRole("heading", { name: /audit|security/i })).toBeVisible();
    // TODO: assert postconditions — seeded audit row appears, tenant RLS scoping verified.
  });

  test.skip("should show impersonator column when set", async ({ page }) => {
    await page.goto("/admin/security");
    await expect(page.getByRole("columnheader", { name: /impersonator/i })).toBeVisible();
    // TODO: assert postconditions — impersonator full_name rendered for rows with impersonator_id.
  });

  test.skip("should filter by table and date range", async ({ page }) => {
    await page.goto("/admin/security?target_table=tenant_members");
    await expect(page.getByRole("table")).toBeVisible();
    // TODO: assert postconditions — only tenant_members rows rendered, others excluded.
  });

  test.skip("should 403 for users without audit:read", async ({ page }) => {
    const response = await page.goto("/admin/security");
    expect([403, 404]).toContain(response?.status() ?? 0);
    // TODO: assert postconditions — physician/nurse/scheduler roles cannot reach the page.
  });

  test.skip("should log admin.audit_exported on CSV download", async ({ page }) => {
    await page.goto("/admin/security");
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
    // TODO: assert postconditions — admin.audit_exported APP event inserted within 1s of click.
  });
});
