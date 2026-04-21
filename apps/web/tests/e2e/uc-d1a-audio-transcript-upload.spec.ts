import { expect, test } from "@playwright/test";

/**
 * UC-D1a — Provider uploads audio for transcription.
 *
 * Skeletons only — each test is `.skip`ped until the orchestrator PR wires up
 * /api/v1/ai/scribe/sessions (create + transcript submit) and the audio-upload
 * half of AIReviewIntakePanel is enabled. The session lifecycle drives status
 * transitions on public.ai_scribe_sessions; assertions polling session status
 * will land with the implementation.
 *
 * See docs/specs/UC-D1a-audio-transcript-upload.md for the full spec + test plan.
 */

const ENCOUNTER_URL = "/encounters/00000000-0000-0000-0000-000000000001";

test.describe("UC-D1a audio transcript upload", () => {
  test.skip("should run audio pipeline end to end and reach awaiting_review", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    // TODO: assert postconditions — upload sample webm; session status transitions pending → transcribing → generating → suggesting_codes → awaiting_review; draft + codes render.
  });

  test.skip("should allow retry on transcription failure", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    // TODO: assert postconditions — stub provider to fail once; expect Retry control; click Retry; expect success.
  });

  test.skip("should switch to paste-transcript after failure", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    // TODO: assert postconditions — after failed audio run, click "Switch to paste", submit text, expect pipeline completes.
  });

  test.skip("should cancel a running session", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    // TODO: assert postconditions — start long audio; click Cancel; expect ai_scribe_sessions.status='cancelled'.
  });

  test.skip("should reject files over 100 MB client-side", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    // TODO: assert postconditions — set a 150 MB file on the input; expect error toast; no ai_scribe_sessions row written.
  });

  test.skip("should 403 when scheduler POSTs to create session", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page).toHaveURL(/encounters/);
    // TODO: assert postconditions — POST /api/v1/ai/scribe/sessions as scheduler (no ai:invoke); expect 403.
  });

  test.skip("should 409 when an active session exists", async ({ page }) => {
    await page.goto(ENCOUNTER_URL);
    await expect(page.getByRole("button", { name: /Upload audio/i })).toBeVisible();
    // TODO: assert postconditions — seed an ai_scribe_sessions row in status 'awaiting_review'; POST create; expect 409 conflict.
  });
});
