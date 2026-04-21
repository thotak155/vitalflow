# VitalFlow

> Multi-tenant healthcare SaaS platform — clinical, ERP, workflow, and AI domains sharing a single
> Turborepo monorepo.

**Stack**: Next.js 15 · React 19 · TypeScript 5.6 · pnpm 9 · Turborepo 2 · Supabase (Postgres +
Auth + Storage + Edge Functions) · Vercel · Tailwind + shadcn/Radix · Zod · PostHog · Sentry ·
Stripe · Resend · Twilio.

---

## 1. Folder tree

```
vitalflow/
├── apps/
│   └── web/                       # Port 3000 — unified role-aware app
│       └── src/app/
│           ├── (auth)/            # /login, /signup, /accept-invite
│           └── (app)/             # authenticated shell
│               ├── page.tsx       # /   → provider dashboard (default)
│               ├── admin/         # /admin/*  (gated: admin:tenant)
│               └── my/            # /my/*     (gated: patient role)
├── packages/
│   ├── config/                    # tsconfig, eslint, tailwind presets
│   ├── ui/                        # Design system + primitives
│   ├── types/                     # Zod schemas + Supabase DB types
│   ├── auth/                      # Supabase SSR + RBAC + middleware
│   ├── ai/                        # LLM providers, guardrails, prompts
│   ├── shared-utils/              # Logger, errors, Result, PHI redaction
│   ├── analytics/                 # Typed event catalog (PostHog)
│   ├── integrations/              # FHIR, HL7, Stripe, Twilio, Resend
│   └── workflows/                 # xstate machines + definitions
├── services/
│   ├── clinical-service/          # Encounters, notes, orders
│   ├── erp-service/               # Billing, claims, AR, inventory
│   ├── workflow-service/          # Task orchestration, SLAs
│   ├── notification-service/      # Multi-channel dispatch
│   └── monetization-service/      # Subscriptions, usage, dunning
├── supabase/
│   ├── migrations/                # SQL migrations (source of truth)
│   ├── functions/                 # Edge functions (deno)
│   ├── seed.sql
│   └── config.toml
├── .github/workflows/             # CI + Deploy (Vercel + Supabase)
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── eslint.config.mjs
```

## 2. Package responsibilities

| Workspace                         | Responsibility                                                                                               | Depends on                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `@vitalflow/config`               | Shared tsconfig, eslint, tailwind presets. Zero runtime code.                                                | —                                       |
| `@vitalflow/types`                | Canonical domain types + Zod schemas + `supabase gen types` output. The one place to add a tenant-scoped ID. | —                                       |
| `@vitalflow/ui`                   | Design system: tokens (CSS vars), primitives (shadcn), clinical composites (VitalsCard, etc.).               | —                                       |
| `@vitalflow/shared-utils`         | Logger (pino w/ PHI redaction), errors, Result, PHI helpers.                                                 | —                                       |
| `@vitalflow/auth`                 | Supabase SSR clients, session middleware, RBAC policy engine.                                                | `types`, `shared-utils`                 |
| `@vitalflow/ai`                   | Provider-agnostic LLM clients (Anthropic, OpenAI), guardrails, prompts, streaming.                           | `types`, `shared-utils`                 |
| `@vitalflow/analytics`            | Typed PostHog event catalog (client + server). Compile-time drift protection.                                | `types`                                 |
| `@vitalflow/integrations`         | Third-party adapters (FHIR, HL7, Stripe, Twilio, Resend). No business logic.                                 | `types`, `shared-utils`                 |
| `@vitalflow/workflows`            | Workflow DSL (xstate v5). Re-usable definitions (encounter-lifecycle, claim-submission).                     | `types`, `shared-utils`                 |
| `@vitalflow/clinical-service`     | Clinical business logic: encounters, notes, orders, signing.                                                 | `auth`, `ai`, `types`, `workflows`      |
| `@vitalflow/erp-service`          | ERP business logic: billing, claims, AR, inventory, HR.                                                      | `auth`, `integrations`, `types`         |
| `@vitalflow/workflow-service`     | Orchestrator: task CRUD, SLA tracking, HITL, retries.                                                        | `auth`, `workflows`, `types`            |
| `@vitalflow/notification-service` | Multi-channel dispatch (email/SMS/push), templates, prefs.                                                   | `integrations`, `types`                 |
| `@vitalflow/monetization-service` | Stripe subscriptions, usage metering, dunning, trials.                                                       | `integrations`, `types`                 |
| `@vitalflow/web`                  | Single unified Next.js app. Role-aware route groups: `/` (provider), `/admin` (admin), `/my` (patient).      | all services, `ui`, `auth`, `analytics` |

**Rule of thumb**: apps orchestrate, services encode domain logic, packages are cross-cutting
infrastructure. Services **must not** import from apps. Packages **must not** import from services
or apps.

## 3. Root configuration files

| File                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `package.json`        | Root scripts, devDependencies, `packageManager`, `engines`, lint-staged. |
| `pnpm-workspace.yaml` | Declares `apps/*`, `packages/*`, `services/*` as workspaces.             |
| `turbo.json`          | Task graph + caching; env allowlists per task.                           |
| `tsconfig.base.json`  | Strict TS defaults every `@vitalflow/config` preset extends.             |
| `eslint.config.mjs`   | Root flat config; re-exports `@vitalflow/config/eslint/base`.            |
| `.prettierrc.js`      | Prettier 3 config + Tailwind plugin.                                     |
| `.gitignore`          | Standard + Next/Turbo/Supabase artifacts.                                |
| `.npmrc`              | pnpm flags: auto-peers, link-workspace-packages, engine-strict.          |
| `.nvmrc`              | Node 20.11.0 (CI + prod pinned).                                         |
| `.env.example`        | Canonical env var catalog (never committed as `.env`).                   |
| `.vscode/`            | Shared editor settings + recommended extensions.                         |
| `.github/workflows/`  | `ci.yml`, `deploy.yml`, CODEOWNERS, PR template.                         |
| `supabase/`           | Migrations (source of truth), edge functions, `config.toml`, seed.       |

## 4. TypeScript strategy

- Single **`tsconfig.base.json`** at the repo root: `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, `moduleResolution: "Bundler"`, `isolatedModules`.
- `@vitalflow/config` exposes 4 presets each package extends:
  - `base.json` — shared strictness only.
  - `nextjs.json` — App Router apps (DOM libs, JSX preserve, next plugin).
  - `react-library.json` — emits `dist/` with `declaration` + `declarationMap`.
  - `node.json` — node-only libraries/services.
- Every workspace has its own `tsconfig.json` that **extends a preset**. No leaf config re-declares
  strictness — drift is a review red flag.
- Domain types are authored **once** in `@vitalflow/types` and consumed via path-specific subpath
  exports (e.g. `@vitalflow/types/clinical`).
- Supabase-generated types are regenerated via `pnpm --filter @vitalflow/types generate`; never
  hand-edited.

## 5. ESLint strategy

- **Flat config** (`eslint.config.mjs`) under ESLint 9.
- `@vitalflow/config/eslint/base.js` — TS + import ordering + `consistent-type-imports`.
- `/react.js` — layered on top: `react`, `react-hooks`, `jsx-a11y`.
- `/nextjs.js` — further layered: `@next/next` + core-web-vitals.
- `/node.js` — baseline plus Node globals.
- Each workspace picks exactly one preset. `eslint-config-prettier` is appended in `base.js` so no
  rule ever conflicts with formatting.
- Lint runs **per workspace** under Turbo so only changed packages re-lint.

## 6. Prettier strategy

- Prettier 3 with `prettier-plugin-tailwindcss` for consistent class order.
- Config at the root (`.prettierrc.js`); no per-workspace overrides.
- 100-char width, `trailingComma: "all"`, double quotes.
- Enforced pre-commit via Husky + `lint-staged`.
- `pnpm format:check` runs in CI against the full tree.

## 7. Environment variable strategy

- **Naming**:
  - `NEXT_PUBLIC_*` → exposed to the browser (safe only).
  - Everything else → server-only.
  - Third-party secrets prefixed with the provider (`STRIPE_*`, `TWILIO_*`).
- **Discovery**: every env var an app or package reads is declared in the root `.env.example`. Each
  app has a slim `.env.example` listing only per-app overrides (port, `NEXT_PUBLIC_APP_NAME`,
  feature flags).
- **Local dev**: copy `.env.example` → `.env.local` at the root and per app.
- **CI/CD**: env is injected from Vercel project env + GitHub Actions secrets.
- **Turbo cache safety**: `turbo.json` declares `env` per task so cache keys invalidate correctly
  when a secret changes.
- **Never** log or commit env values. `shared-utils/logger` redacts common secret paths
  (`authorization`, `cookie`, `token`, `password`).
- **HIPAA**: PHI keys (`ssn`, `dob`, `mrn`, …) are redacted by `@vitalflow/shared-utils/phi`
  **before** anything leaves our network.

## 8. Shared design system approach

- `@vitalflow/ui` owns tokens, primitives, and clinical composites.
- **Tokens** as CSS custom properties (`--vf-*`) in `packages/ui/src/styles/tokens.css`. Tenants
  override a subset at runtime for per-brand theming without rebuilding.
- **Tailwind** preset (`@vitalflow/config/tailwind/preset`) maps every token to a Tailwind
  color/radius/font so utilities stay token-driven.
- **Primitives**: Radix + `class-variance-authority` (Button, Dialog, Tabs…).
- **Composites**: clinical-domain components (`VitalsCard`, `AllergyBadge`, `EncounterTimeline`) in
  `packages/ui/src/clinical/`.
- **Figma**: design tokens in Figma are synced to `tokens.css` via Figma Tokens (Tokens Studio
  plugin) → PR.
- **Dark mode**: `.dark` class strategy; tenant theme toggle lives in admin.
- **Accessibility**: `jsx-a11y` lint gate + Playwright axe checks in E2E.

## 9. Local development workflow

```bash
# 1. Prereqs
node --version        # >= 20.11 (use `nvm use`)
corepack enable       # activates pnpm 9 from packageManager

# 2. Install
pnpm install

# 3. Configure env
cp .env.example .env.local
# edit .env.local with your Supabase keys

# 4. Supabase (local)
supabase start
pnpm --filter @vitalflow/types generate

# 5. Run everything
pnpm dev              # unified web app on :3000 — visit /, /admin, /my

# 6. Targeted dev
pnpm --filter @vitalflow/web dev
pnpm --filter @vitalflow/ui dev           # watch-build the design system

# 7. Verify before pushing
pnpm lint
pnpm typecheck
pnpm test
pnpm build            # full turbo build
```

## 10. Branch and CI/CD workflow

**Branch model**

- `main` — production. Protected. Deploys to Vercel prod + runs Supabase migrations on merge.
- `develop` — integration. Deploys to staging.
- `feat/<ticket>` / `fix/<ticket>` / `chore/<ticket>` — short-lived. Open PR into `develop` (or
  `main` for hotfix).

**PR gates (required checks)**

1. `install` — pnpm frozen lockfile resolves.
2. `lint` — `pnpm lint` + `pnpm format:check`.
3. `typecheck` — `pnpm typecheck` across the graph.
4. `test` — unit tests (`vitest`).
5. `build` — full `turbo build` with remote cache.
6. Vercel preview deployment for each changed app.
7. CODEOWNERS approval for the touched area.

**Deployment**

- **Apps**: three separate Vercel projects (one per `apps/*`). Each project sets its root to the
  monorepo and `pnpm build --filter <app>` as its build command, enabling per-app independent
  deploys.
- **Supabase**: migrations in `supabase/migrations/` are applied by the `migrate-db` job on merge to
  `main`. Every migration is additive and **must** include matching RLS policy updates in the same
  PR.
- **Edge functions** (`supabase/functions/*`): deployed with `supabase functions deploy` from CI
  after migrations succeed.
- **Releases**: `changesets` version internal packages; apps are versioned by git SHA via Vercel.
- **Rollback**: Vercel instant rollback per app; Supabase migrations roll forward only (compensating
  migration).

---

## HIPAA / security notes

- PHI never flows to logs, analytics events, or AI prompts — enforced by
  `@vitalflow/shared-utils/phi` and `@vitalflow/ai/guardrails`.
- Every tenant-scoped Postgres table has RLS bound to `auth.uid() + tenant_id`. Tests live in
  `supabase/migrations/*_rls.sql`.
- Signed BAA required before a tenant's `hipaaBaaSigned` flag flips.
- Secrets rotated via Vercel + Supabase; GitHub secrets set per environment.

## License

UNLICENSED — proprietary. © VitalFlow.
