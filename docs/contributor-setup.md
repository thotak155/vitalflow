# Contributor Setup

> From zero to a running preview in under 15 minutes. If a step fails, flag it in `#vitalflow-dev` — setup friction is a bug.

## Prerequisites

Install once, before your first clone:

| Tool                   | Version / install                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Node.js                | **20.11+** via [nvm](https://github.com/nvm-sh/nvm) (`.nvmrc` pinned)              |
| pnpm                   | **9.12.0** — `corepack enable` (or `npm i -g pnpm@9.12.0`)                          |
| Git                    | 2.40+                                                                              |
| Supabase CLI           | Installed as a dev dep — no global install needed                                  |
| Vercel CLI             | Optional — `npm i -g vercel` if you want to trigger previews manually              |
| GitHub CLI (`gh`)      | 2.40+ — required for some tooling (env var scaffolding, rulesets)                  |
| Docker Desktop         | Required for `supabase start` (local Postgres + auth + storage)                    |
| VS Code                | Recommended — `.vscode/settings.json` + `.vscode/extensions.json` auto-configure   |

## First-time setup

```bash
# 1. Clone
git clone git@github.com:vitalflow/vitalflow.git
cd vitalflow

# 2. Node version
nvm use                      # reads .nvmrc → Node 20.11

# 3. Install workspace
corepack enable              # one-time, activates pnpm 9.12
pnpm install                 # ~45s, resolves all 18 workspaces

# 4. Copy env template
cp .env.example .env.local
# open .env.local in your editor, fill in:
#   - AUTH_SECRET    → `openssl rand -base64 32`
#   - keep Supabase values pointing at localhost (default)
#   - leave provider keys blank unless you're wiring that path

# 5. Start local infrastructure
supabase start               # ~60s on first run; pulls Postgres + auth images
# copy the printed "anon key" / "service_role key" into .env.local

# 6. Apply DB schema + generate types
supabase db reset            # runs every migration in supabase/migrations/
pnpm --filter @vitalflow/types generate

# 7. Run apps
pnpm dev                     # provider :3000, admin :3001, patient :3002
```

Visit:

- <http://localhost:3000/> — provider dashboard (default)
- <http://localhost:3000/admin> — admin console (requires admin role)
- <http://localhost:3000/my> — patient portal (requires patient role)
- <http://localhost:3000/login> — sign-in (placeholder until auth is wired)
- <http://localhost:54323> — Supabase Studio

> The scaffold dev-stub session carries `clinician + admin` roles so both surfaces render. Flip the role array in [`apps/web/src/lib/session.ts`](../apps/web/src/lib/session.ts) while building flows.

## Day-to-day commands

```bash
pnpm dev                                    # unified web app (:3000)
pnpm --filter @vitalflow/web dev            # same, explicit
pnpm --filter @vitalflow/ui dev             # watch-build the design system

pnpm lint                                   # ESLint + prettier check
pnpm lint:fix                               # auto-fix
pnpm format                                 # prettier write
pnpm typecheck                              # tsc --noEmit across graph
pnpm test                                   # vitest run
pnpm test:watch                             # vitest in watch
pnpm build                                  # turbo build (cached)

supabase db reset                           # reapply every migration
supabase migration new <name>               # scaffold a new migration file
pnpm --filter @vitalflow/types generate     # regenerate DB types
```

## Git workflow

```bash
git checkout develop && git pull
git checkout -b feat/<ticket>-<slug>
# ... edit code ...
pnpm lint && pnpm typecheck && pnpm test    # same gates as CI
git add -p
git commit                                  # hooks will re-run lint/format
git push -u origin HEAD
gh pr create --base develop --fill          # or open in browser
```

**On the PR:**

- Fill in the PR template (scope, compliance checklist, test plan).
- If you touched a shared package or service, run `pnpm changeset` and commit the generated file.
- CI will run automatically. Preview URLs get posted as a sticky comment within ~3 minutes.

**Merging:**

- Squash merge by default.
- Rebase if you need to preserve individual commits for `git blame` clarity.
- Never use "Create a merge commit" — branch protection enforces linear history on `main`.

## Healthcare / PHI rules

These are **baked into code review**:

1. No real PHI in local, dev, preview, or CI. Scrubbed fixtures only.
2. PHI columns (SSN, email, phone, MRN, DOB) are redacted by [`@vitalflow/shared-utils/phi`](../packages/shared-utils/src/phi.ts) before anything ships to logs, analytics, or AI providers.
3. Any new tenant-scoped table **must** have RLS enabled + policies in the same migration that creates it.
4. New API keys for third-party services that touch PHI require a signed BAA on file **before** the key is provisioned in production.

## Environment access

| Environment  | Who can deploy?                  | Who can read secrets?           |
| ------------ | -------------------------------- | ------------------------------- |
| `local`      | Everyone (on your laptop)        | N/A                             |
| `development`| Auto from `develop` branch       | `@vitalflow/engineering`        |
| `preview`    | Auto per PR                      | `@vitalflow/engineering`        |
| `staging`    | Auto from `develop`              | `@vitalflow/engineering`        |
| `production` | Approver gate via `ops-production` | `@vitalflow/ops-production`     |

If you need access, open an issue in the `ops` project and tag `@vitalflow/security`.

## Troubleshooting

**`pnpm install` fails with `ERR_PNPM_UNSUPPORTED_ENGINE`** → Node is below 20.11. `nvm install` and `nvm use` the version in `.nvmrc`.

**`supabase start` hangs** → Docker isn't running, or port 54321/54322/54323 is in use. `supabase stop` then retry.

**Apps load but say "Missing NEXT_PUBLIC_SUPABASE_URL"** → `.env.local` not populated yet, or you ran `pnpm dev` from outside the repo root (envs are loaded from the app dir + the repo root).

**Typecheck passes locally, fails on CI** → Check that your Node minor version matches CI (`.nvmrc`). Also delete `node_modules` + `.next` + `.turbo` and reinstall.

**Preview deploy doesn't post a URL to the PR** → CI may have failed before `deploy`; open the Actions tab on the PR to see which job failed.

## Docs index

- [devops-strategy.md](devops-strategy.md) — how code moves from laptop to production
- [database-architecture.md](database-architecture.md) — schema, RLS, audit model
- [ui-guidelines.md](ui-guidelines.md) — design system + component standards
- [deployment-checklist.md](deployment-checklist.md) — what to do before/during/after a prod deploy
