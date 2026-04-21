# Changesets

Version management for the VitalFlow monorepo. Every PR that touches a shared `packages/*` or
`services/*` must include a changeset.

## Add a changeset

```bash
pnpm changeset
```

Answer the prompts — pick affected packages and bump level (`patch` / `minor` / `major`). A new
`.changeset/<random>.md` file is created. Commit it with the PR.

## Release flow

1. `changesets-bot` comments on PRs missing a changeset.
2. On merge to `main`, [release.yml](../.github/workflows/release.yml) opens a "Version Packages" PR
   that applies all pending changesets.
3. When that PR is merged, the workflow creates git tags `vX.Y.Z` per app in the `linked` group.
4. A tag push triggers [deploy-production.yml](../.github/workflows/deploy-production.yml).

See [docs/devops-strategy.md §9](../docs/devops-strategy.md#9-release-tagging-strategy).
