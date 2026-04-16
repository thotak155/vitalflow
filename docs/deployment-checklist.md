# Deployment Checklist

> Every production release runs through this checklist. The release manager (RM) for the week is responsible. File a post-mortem if any step is skipped.

## T-1 day — release readiness

Prepare the release in a small window the day before shipping to avoid Tuesday-morning chaos.

- [ ] **Release branch cut.** `git checkout -b release/vX.Y.Z develop && git push -u origin HEAD`.
- [ ] **Version PR open.** Merge the Changesets "Version Packages" PR so tags are ready.
- [ ] **Changelog reviewed.** Spot-check the aggregated `.changeset/*` summaries render cleanly in the GitHub Release preview.
- [ ] **Database migrations reviewed.** Each new file in `supabase/migrations/` has:
  - [ ] Matching RLS policies on any new tenant-scoped table.
  - [ ] Covering indexes on every FK (verified by advisor in CI).
  - [ ] Audit trigger attached (via `audit.log_change()`) if the table stores PHI or financial data.
  - [ ] Idempotent (`if not exists`, `drop policy if exists`) — safe to re-run.
- [ ] **Breaking changes announced.** If any API or behavior change is backward-incompatible, a notice has been sent in `#vitalflow-customers` at least 48h ago.
- [ ] **Feature flags staged.** New features default to OFF in `production`. Rollout is planned in `feature_flag_overrides`.
- [ ] **Staging smoke green.** Every check on the staging deploy for this SHA is green. No "skipped" or "neutral."

## T-0 — go/no-go (30 min before deploy)

- [ ] **Change window.** We are not inside the freeze window (Fri noon PT → Sun end-of-day).
- [ ] **On-call coverage confirmed.** RM + backup on-call acknowledged in PagerDuty.
- [ ] **Slack post in `#vitalflow-deploys`.** Release notes + git SHA + expected rollout duration.
- [ ] **Backup verified.** Most recent automated Supabase backup is < 24h old; PITR window covers the current hour.
- [ ] **Open incidents.** No open SEV1 or SEV2 incidents. If there are, defer release.
- [ ] **Third-party status.** Supabase, Vercel, Stripe, Resend, Twilio status pages all green.
- [ ] **Advisors clean.** Supabase security advisors report zero ERROR-level findings.

## Deploy — do the thing

1. Merge `release/vX.Y.Z` → `main` via squash merge (CODEOWNERS approval required).
2. Changesets bot creates tag `vX.Y.Z` automatically on merge of the Version PR.
3. Tag push triggers [`deploy-production.yml`](../.github/workflows/deploy-production.yml):
   - [ ] `guard` — confirms commit was green on staging.
   - [ ] `gate` — re-runs full CI on the tagged commit.
   - [ ] `migrate-db` — applies migrations to `vitalflow-prod` (requires RM approval via the `production` GitHub Environment).
   - [ ] `deploy` — deploys all three apps to Vercel production.
   - [ ] `smoke` — Playwright `@smoke`-tagged tests against production URLs.
   - [ ] `release` — creates the GitHub Release with generated notes.
   - [ ] `sentry` — associates errors with the new release SHA.
4. Every job above must end green. If any fail, see [Rollback](#rollback).

## T+15 min — post-deploy verification

- [ ] **Sentry.** No spike in error rate vs. prior 1h baseline. No new-to-release errors.
- [ ] **Supabase.** API latency in the "Reports" tab is within 10% of the prior 1h baseline. No error spikes in the logs.
- [ ] **PostHog.** Pageview + login funnels healthy. No traffic collapse.
- [ ] **PagerDuty.** No new alerts triggered by the release.
- [ ] **Feature flags.** If this release ships a new feature behind a flag, flip it to `rollout_percent = 10` and watch for 30 min.
- [ ] **Real-user test.** RM logs in as a test tenant and walks through the highest-risk flow touched by this release.
- [ ] **Slack post.** "Release vX.Y.Z shipped successfully, no regressions observed." in `#vitalflow-deploys`.

## T+24h — bake period

- [ ] **Error trend.** No long-tail issues emerging in Sentry.
- [ ] **Billing sanity.** Stripe dashboard shows expected volume and no webhook retry storms.
- [ ] **Feature flag rollout.** Gradually move `rollout_percent` to 25 → 50 → 100 if metrics hold.
- [ ] **Release retro.** In the weekly eng sync, share one "what went well" and one "what to improve."

## Rollback

When you decide to roll back, act fast — **goal is ≤ 5 min from decision to last-good live.**

### App-only rollback

```bash
# In Vercel UI per app:
#   Deployments tab → last green production deploy → "Promote to Production"
# or via CLI:
VERCEL_TOKEN=... npx vercel rollback <deployment-url> --yes
```

Verify via Sentry and smoke tests immediately.

### Migration-driven rollback

**Never `DOWN` a production migration.**

1. Write a compensating migration (`NNNN_revert_<name>.sql`) — must be data-preserving and idempotent.
2. PR + merge + tag + release like any other deploy.
3. If the incident is catastrophic (data loss, cannot compensate), restore from Supabase PITR:
   - Dashboard → Database → Backups → PITR
   - Restore to the minute *before* the offending deploy
   - Restoration takes 15–45 min and disconnects existing sessions
   - Follow the runbook to retarget DNS / Vercel → restored project

### Incident communication

1. Page the on-call via PagerDuty at SEV1 or SEV2.
2. Slack post in `#vitalflow-incidents` within 5 min — include symptom, blast radius, current action.
3. Status page (`status.vitalflow.health`) updated within 10 min if customers are impacted.
4. 48h post-mortem with timeline, root cause, action items.

## Release manager handoff

Rotate weekly. The outgoing RM writes a 3-line handoff in `#vitalflow-deploys` covering: state of `develop`, open flags/rollouts being watched, anything weird on staging.
