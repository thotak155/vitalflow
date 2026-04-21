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

// -- V1 billing services --------------------------------------------------

export * from "./charge-service.js";
export * from "./claim-service.js";
export * from "./denial-service.js";
export * from "./payment-service.js";
export * from "./patient-balance-service.js";
export {
  makeSupabaseClaimData,
  makeSupabaseDenialData,
  makeSupabasePatientBalanceData,
  makeSupabasePaymentData,
  chargeRowToChargeLine,
  balanceRowToDomain,
  paymentRowToDomain,
  denialRowToDomain,
  type ClaimBundle,
  type ClaimDataAccess,
  type DenialDataAccess,
  type PatientBalanceDataAccess,
  type PaymentDataAccess,
} from "./supabase-data-access.js";
