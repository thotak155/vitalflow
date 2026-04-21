# GitHub + Vercel Setup

> One-time setup to take this repo from a local folder to a deployed app. Allow ~30 minutes.

## 0. Prerequisites

- [ ] GitHub account with permission to create repos under your org (or personal account)
- [ ] Vercel account linked to the same GitHub — [vercel.com/signup](https://vercel.com/signup)
- [ ] Supabase project already created (you have `MedPro-VitalFlow` at ref `agxumcgutolrenlgxnta`)

## 1. Create the GitHub repository

**Option A — via the web (simplest):**

1. Go to <https://github.com/new>.
2. Name: `vitalflow` (or your org's convention).
3. Privacy: **Private**. This repo contains healthcare domain code; keep it private even before PHI
   is involved.
4. **Do not** initialize with README/.gitignore/license — the repo already has them.
5. Click **Create repository**.
6. Copy the `git remote add origin …` command GitHub shows you — you'll use it in step 3.

**Option B — via the GitHub CLI:**

```bash
# Install gh first if you don't have it: https://cli.github.com/
gh auth login
gh repo create vitalflow --private --source=. --remote=origin --push
```

## 2. Verify the local repo is clean

The local repo has already been initialized with a first commit covering the full scaffold. Before
pushing, confirm nothing sensitive snuck in:

```bash
# No .env.local or secrets staged
git ls-files | grep -E "\.env($|\.local|\.staging$|\.production$)"
# Expected output: nothing (the .env.example files are committed on purpose;
# .env, .env.local, .env.*.local are git-ignored)

git log --oneline
# Expected: a single initial commit
```

If anything unexpected appears, see [Troubleshooting](#troubleshooting) below.

## 3. Push to GitHub

```bash
git remote add origin git@github.com:<your-org>/vitalflow.git
# (or https://github.com/<your-org>/vitalflow.git if you don't use SSH)

git branch -M main

git push -u origin main

# Optional: create a develop branch for the CI/CD pipeline we already configured
git checkout -b develop
git push -u origin develop
```

## 4. Create the Vercel project

1. Go to <https://vercel.com/new>.
2. Select **Import Git Repository** and pick `vitalflow`.
3. **Root Directory:** set to `apps/web` (click "Edit" next to the path). Vercel auto-detects
   Next.js and pnpm.
4. **Framework Preset:** Next.js (auto-detected).
5. **Build / Install commands:** **do not override** — the
   [`apps/web/vercel.json`](../apps/web/vercel.json) pins them to the monorepo-aware versions.
6. **Environment Variables:** at minimum, add these (copy values from your Supabase dashboard →
   Project Settings → API):

   | Name                            | Value                                                             |
   | ------------------------------- | ----------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | `https://agxumcgutolrenlgxnta.supabase.co`                        |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key)                                                        |
   | `SUPABASE_SERVICE_ROLE_KEY`     | (service role secret — mark as **sensitive**)                     |
   | `SUPABASE_JWT_SECRET`           | (JWT secret — **sensitive**)                                      |
   | `AUTH_SECRET`                   | `openssl rand -base64 32` per environment                         |
   | `NEXT_PUBLIC_APP_URL`           | `https://<vercel-production-domain>` (fill in after first deploy) |
   | `VITALFLOW_ENV`                 | `production` (or `staging`, `preview`)                            |

   Scope each variable to **Production**, **Preview**, and/or **Development** as appropriate. See
   [`.env.production.example`](../.env.production.example) and
   [`.env.staging.example`](../.env.staging.example) for the full list to mirror across
   environments.

7. Click **Deploy**. The first build takes ~4 min.

## 5. Configure the Supabase auth redirect URLs

After Vercel assigns your production domain (e.g. `vitalflow.vercel.app` or your custom domain):

1. Supabase Dashboard → **Authentication** → **URL Configuration**.
2. **Site URL:** `https://<your-production-domain>`
3. **Redirect URLs:** add every URL the app will call back to:

   ```
   http://localhost:3000/auth/callback
   https://<your-production-domain>/auth/callback
   https://*-<your-vercel-team>.vercel.app/auth/callback   ← preview deploys
   ```

Without this, magic-link sign-in will reject the callback.

## 6. (Optional) Wire up the CI/CD pipeline we already built

The repo ships with complete GitHub Actions workflows at
[.github/workflows/](../.github/workflows/). They'll run on push — but they need secrets before they
can deploy.

### Secrets to add at GitHub → Settings → Secrets and variables → Actions

**Repository secrets:**

```
VERCEL_TOKEN                     # vercel.com/account/tokens
VERCEL_ORG_ID                    # vercel.com/<team>/settings → Team ID
VERCEL_PROJECT_ID_WEB            # vercel.com/<team>/<project>/settings → Project ID
SUPABASE_ACCESS_TOKEN            # supabase.com/dashboard/account/tokens
SUPABASE_ACCESS_TOKEN_DEV        # scoped access token for the dev project
SUPABASE_DB_PASSWORD_STAGING     # staging DB password
SUPABASE_DB_PASSWORD_PROD        # prod DB password (after you create prod project)
TURBO_TOKEN                      # vercel.com/account/tokens → scoped for Turbo remote cache (reuse VERCEL_TOKEN is OK)
SENTRY_AUTH_TOKEN                # optional — for release creation
SLACK_WEBHOOK_DEPLOY             # optional — deploy notifications
GITLEAKS_LICENSE                 # optional — only if you have a gitleaks enterprise license
RELEASE_BOT_TOKEN                # optional — PAT for pushing version bumps past branch protection
```

**Repository variables:**

```
TURBO_TEAM                       # your Vercel team slug
SUPABASE_PROJECT_REF_DEV         # e.g. agxumcgutolrenlgxnta (for now, dev = this project)
SUPABASE_PROJECT_REF_STAGING     # after you create staging project
SUPABASE_PROJECT_REF_PROD        # after you create prod project
```

### Environments to create at GitHub → Settings → Environments

| Environment           | Required reviewers                       |
| --------------------- | ---------------------------------------- |
| `staging`             | (none — auto-deploys from `develop`)     |
| `production`          | At least 1 reviewer from your ops team   |
| `production-readonly` | (none — used by the weekly advisor scan) |

### Branch protection rules

Apply the rulesets shipped in [.github/rulesets/](../.github/rulesets/):

```bash
# After auth'ing gh against the repo:
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh api repos/$REPO/rulesets --method POST --input .github/rulesets/main.json
gh api repos/$REPO/rulesets --method POST --input .github/rulesets/develop.json
```

These enforce CODEOWNERS review, required status checks, linear history, and signed commits on
`main`.

## 7. Verify end-to-end

1. Visit your Vercel production URL — you should be redirected to `/login`.
2. Enter an email address that matches a `auth.users` row in Supabase.
3. Click the magic link → land on `/` (the provider dashboard).
4. Open a PR — verify a preview deploy URL is posted to the PR by the
   [preview workflow](../.github/workflows/preview.yml).

If login fails or the preview doesn't post, skip to [Troubleshooting](#troubleshooting).

## 8. Optional: staging + production Supabase projects

You currently have one Supabase project (`MedPro-VitalFlow`). For real staging/prod separation:

1. Create two new Supabase projects: `vitalflow-staging` and `vitalflow-prod`.
2. Push the same 15 migrations to each:

   ```bash
   supabase link --project-ref <new-project-ref>
   supabase db push --linked
   ```

3. Update the GitHub variables `SUPABASE_PROJECT_REF_STAGING` / `SUPABASE_PROJECT_REF_PROD` with the
   new refs.
4. Update Vercel's **Preview** environment variables to point at staging, **Production** at prod.
   Each tier gets its own Supabase URL + anon key + service-role secret.
5. Rotate all secrets so prod keys are never used in staging.

See [`docs/devops-strategy.md` §1](devops-strategy.md#1-environment-naming-convention) for the full
environment matrix.

## Troubleshooting

**"nothing to commit, working tree clean" on first `git push`** — you haven't committed yet. Run
`git status` to see untracked files; the initial commit should have captured everything.

**`.env.local` appears in `git ls-files`** — it shouldn't. Run `git rm --cached .env.local` and
recommit. Verify `.gitignore` contains `.env.local`.

**Vercel build fails with `Cannot find module '@vitalflow/ui'`** — Root Directory isn't `apps/web`,
or `vercel.json` was overridden in the Vercel UI. Reset both.

**Magic link redirects to 401** — Supabase URL Configuration doesn't list
`https://<your-domain>/auth/callback`. Add it.

**Preview deploys work but auth fails on preview** — add
`https://*-<your-vercel-team>.vercel.app/auth/callback` as a wildcard redirect in Supabase.

**CI workflows fail with "secret not found"** — a required secret is missing. Check which job failed
and cross-reference the list in §6.

**`.env.example` files appear in gitleaks alerts** — the [gitleaks.toml](../.github/gitleaks.toml)
allowlist already covers them; if you see false positives, check your fork of the config.
