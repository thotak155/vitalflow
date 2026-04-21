# Branch protection rulesets

GitHub ruleset definitions applied to `main` and `develop`.

## Apply

```bash
gh api repos/:owner/:repo/rulesets --method POST --input .github/rulesets/main.json
gh api repos/:owner/:repo/rulesets --method POST --input .github/rulesets/develop.json
```

## Update

Rulesets are idempotent via the ruleset name. To update after editing a file:

```bash
RULESET_ID=$(gh api repos/:owner/:repo/rulesets --jq '.[] | select(.name=="protect-main") | .id')
gh api repos/:owner/:repo/rulesets/$RULESET_ID --method PUT --input .github/rulesets/main.json
```

## What these rules enforce

See [docs/devops-strategy.md §7](../../docs/devops-strategy.md#7-branch-protection-recommendations).

## GitHub Environments (required)

Independent of branch protection, these environments must exist in the repo Settings → Environments:

| Environment           | Required reviewers                 | Secrets                                                                               |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `staging`             | None                               | `VERCEL_*`, `SUPABASE_*_STAGING`, `SLACK_WEBHOOK_DEPLOY`                              |
| `production`          | `ops-production` team (1 approver) | `VERCEL_*`, `SUPABASE_*_PROD`, `SENTRY_AUTH_TOKEN`, `SLACK_WEBHOOK_DEPLOY`            |
| `production-readonly` | None                               | `SUPABASE_ACCESS_TOKEN` (read-only scope); used by the scheduled security advisor job |
