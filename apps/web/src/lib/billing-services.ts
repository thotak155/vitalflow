import { createVitalFlowAdminClient } from "@vitalflow/auth/admin";
import {
  ChargeServiceImpl,
  ClaimServiceImpl,
  DenialServiceImpl,
  PatientBalanceServiceImpl,
  PaymentServiceImpl,
  makeSupabaseClaimData,
  makeSupabaseDenialData,
  makeSupabasePatientBalanceData,
  makeSupabasePaymentData,
} from "@vitalflow/erp-service";

import { makeSupabaseChargeData } from "../app/(app)/encounters/[id]/charge-capture/supabaseChargeData.js";

/**
 * Factory that builds the full billing service stack wired to the Supabase
 * admin client. Server actions call this once per request.
 *
 * Each service has the `balances` dep wired so that charge-post and
 * payment-record automatically keep `public.patient_balances` in sync.
 * Clearinghouse is deliberately omitted — `ClaimServiceImpl.submit` and
 * `.applyRemittance` throw `INTEGRATION_NOT_CONFIGURED` until an adapter
 * lands.
 *
 * Note: this module imports `createVitalFlowAdminClient` which reads env
 * vars at call time. Don't instantiate at module load — do it inside the
 * action handler so test harnesses can tree-shake.
 */
export function buildBillingServices() {
  const admin = createVitalFlowAdminClient();

  const balances = new PatientBalanceServiceImpl({
    data: makeSupabasePatientBalanceData(admin),
  });

  const charges = new ChargeServiceImpl({
    data: makeSupabaseChargeData(admin),
    balances,
  });

  const payments = new PaymentServiceImpl({
    data: makeSupabasePaymentData(admin),
    balances,
  });

  const claims = new ClaimServiceImpl({
    data: makeSupabaseClaimData(admin),
    // clearinghouse intentionally undefined — see design doc
  });

  const denials = new DenialServiceImpl({
    data: makeSupabaseDenialData(admin),
  });

  return { admin, balances, charges, payments, claims, denials };
}
