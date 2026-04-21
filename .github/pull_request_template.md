## Summary

<!-- What changed and why. Link the ticket. -->

## Scope

- [ ] apps/provider-app
- [ ] apps/admin-app
- [ ] apps/patient-portal
- [ ] packages/\*
- [ ] services/\*
- [ ] supabase (schema / RLS / functions)

## Compliance checklist

- [ ] No PHI in logs, analytics events, or AI prompts
- [ ] RLS policies updated for any new tenant-scoped table
- [ ] New permissions registered in `@vitalflow/auth/rbac`
- [ ] Secrets use env vars (never hard-coded)

## Test plan

- [ ] Unit tests added/updated
- [ ] E2E covers the new path (Playwright)
- [ ] Manually verified in preview deployment
