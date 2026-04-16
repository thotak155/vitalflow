import { requirePermission } from "@vitalflow/auth/rbac";
import { notFound } from "@vitalflow/shared-utils/errors";
import type { Encounter, EncounterId, TenantContext } from "@vitalflow/types";

export interface EncounterRepository {
  findById(tenantId: string, id: EncounterId): Promise<Encounter | null>;
  list(tenantId: string, opts: { limit: number; cursor?: string }): Promise<Encounter[]>;
  create(encounter: Encounter): Promise<Encounter>;
}

export function makeEncounterService(repo: EncounterRepository) {
  return {
    async get(ctx: TenantContext, id: EncounterId): Promise<Encounter> {
      requirePermission(ctx, "clinical:read");
      const row = await repo.findById(ctx.tenantId, id);
      if (!row) {
        throw notFound(`Encounter ${id} not found`);
      }
      return row;
    },
    async list(ctx: TenantContext, limit = 50, cursor?: string): Promise<Encounter[]> {
      requirePermission(ctx, "clinical:read");
      return repo.list(ctx.tenantId, { limit, cursor });
    },
    async create(ctx: TenantContext, encounter: Encounter): Promise<Encounter> {
      requirePermission(ctx, "clinical:write");
      return repo.create(encounter);
    },
  };
}
