import { requirePermission } from "@vitalflow/auth/rbac";
import type { Invoice, InvoiceId, TenantContext } from "@vitalflow/types";

export interface InvoiceRepository {
  findById(tenantId: string, id: InvoiceId): Promise<Invoice | null>;
  list(tenantId: string, opts: { limit: number }): Promise<Invoice[]>;
}

export function makeBillingService(repo: InvoiceRepository) {
  return {
    async listInvoices(ctx: TenantContext, limit = 50): Promise<Invoice[]> {
      requirePermission(ctx, "billing:read");
      return repo.list(ctx.tenantId, { limit });
    },
  };
}
