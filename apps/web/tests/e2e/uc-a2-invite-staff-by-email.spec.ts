import { expect, test } from "@playwright/test";

/**
 * UC-A2 — Practice owner invites staff by email
 *
 * Spec: docs/specs/UC-A2-invite-staff-by-email.md
 *
 * The existing /admin/members page creates members by directly inserting into
 * public.tenant_members. These tests target the replacement invite flow that
 * writes to public.invitations and enqueues an email notification. Keep
 * skipped until the inviteMember server action lands.
 */

test.describe("UC-A2 · invite staff by email", () => {
  test.skip("should create a pending invitation and queue email", async ({ page }) => {
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();
    // TODO: assert postconditions — invitations row status='pending', notifications row queued, audit event member.invited.
  });

  test.skip("should reject invite for existing member", async ({ page }) => {
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();
    // TODO: assert postconditions — no new invitation row, conflict error banner visible.
  });

  test.skip("should reject duplicate pending invitation", async ({ page }) => {
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();
    // TODO: assert postconditions — second submit surfaces E_CONFLICT per unique (tenant_id, email, status).
  });

  test.skip("should block office_admin from inviting practice_owner", async ({ page }) => {
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();
    // TODO: assert postconditions — E_PERMISSION message, no invitation row.
  });

  test.skip("should hide invite form for users without admin:users", async ({ page }) => {
    const response = await page.goto("/admin/members");
    expect([200, 403, 404]).toContain(response?.status() ?? 0);
    // TODO: assert postconditions — invite form not rendered for scheduler/biller.
  });
});
