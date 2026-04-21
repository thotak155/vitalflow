import { expect, test } from "@playwright/test";

/**
 * UC-A3 — Staff accepts invitation and sets password
 *
 * Spec: docs/specs/UC-A3-invitation-acceptance.md
 *
 * Tests cover the public /invitations/accept?token=… route. They need fixtures
 * that seed public.invitations with a known raw token (and the corresponding
 * sha256 hash on the row). Keep skipped until the route and acceptInvitation
 * server action land. Prior art: apps/web/src/app/(auth)/set-password/page.tsx.
 */

test.describe("UC-A3 · invitation acceptance", () => {
  test.skip("should accept invitation, create user, and redirect to /", async ({ page }) => {
    await page.goto("/invitations/accept?token=test-seed-token");
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    // TODO: assert postconditions — tenant_members row, invitations.status='accepted', session cookie, redirect to /.
  });

  test.skip("should reject expired token", async ({ page }) => {
    await page.goto("/invitations/accept?token=expired-seed-token");
    await expect(page.getByText(/no longer valid/i)).toBeVisible();
    // TODO: assert postconditions — no DB mutation, error page rendered.
  });

  test.skip("should reject already-accepted token", async ({ page }) => {
    await page.goto("/invitations/accept?token=accepted-seed-token");
    await expect(page.getByText(/no longer valid/i)).toBeVisible();
    // TODO: assert postconditions — invitation.status stays 'accepted', no duplicate tenant_members row.
  });

  test.skip("should attach existing auth user without recreating", async ({ page }) => {
    await page.goto("/invitations/accept?token=existing-user-token");
    await expect(page.getByRole("button", { name: /continue|set password/i })).toBeVisible();
    // TODO: assert postconditions — no new auth.users row, tenant_members inserted for existing user_id.
  });

  test.skip("should reject password mismatch", async ({ page }) => {
    await page.goto("/invitations/accept?token=test-seed-token");
    await expect(page.getByRole("textbox", { name: /^password$/i })).toBeVisible();
    // TODO: assert postconditions — form re-renders with error, no invitation mutation.
  });
});
