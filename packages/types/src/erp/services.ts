import type { EncounterId, PatientId } from "../clinical/index.js";
import type { TenantContext } from "../tenancy/index.js";

import type {
  Charge,
  ChargeLine,
  ChargeId,
  CreateChargeLineInput,
  UpdateChargeLineInput,
  VoidChargeInput,
} from "./charge.js";
import type {
  ApplyRemittanceInput,
  AppealClaimInput,
  Claim,
  ClaimId,
  ClaimLine,
  ClaimStatus,
  ClaimStatusHistory,
  CloseClaimInput,
  CreateClaimFromChargesInput,
} from "./claim.js";
import type {
  AppealDenialInput,
  AssignDenialInput,
  CreateDenialInput,
  Denial,
  DenialId,
  DenialQueueFilter,
  RecordDenialWorkInput,
  ResolveDenialInput,
  WriteOffDenialInput,
} from "./denial.js";
import type { BalanceDeltaInput, BalanceListFilter, PatientBalance } from "./patient-balance.js";
import type {
  Payment,
  PaymentId,
  PaymentListFilter,
  RecordPaymentInput,
  RefundPaymentInput,
} from "./payment.js";

/**
 * V1 Billing / RCM service contracts. Implementations land in the next slice.
 * This file is the single source of truth for route handlers and tests.
 *
 * See docs/billing-rcm.md for the full design.
 */

// ---------------------------------------------------------------------------
// ChargeService
// ---------------------------------------------------------------------------

export interface ChargeService {
  /** Lines for one encounter, in creation order. */
  listByEncounter(ctx: TenantContext, encounterId: EncounterId): Promise<readonly ChargeLine[]>;

  /** Aggregate view: all lines + computed rollup status + total. */
  getChargeForEncounter(ctx: TenantContext, encounterId: EncounterId): Promise<Charge | null>;

  create(ctx: TenantContext, input: CreateChargeLineInput): Promise<ChargeLine>;

  update(ctx: TenantContext, id: ChargeId, patch: UpdateChargeLineInput): Promise<ChargeLine>;

  /** draft → posted. Emits charge.created. */
  post(ctx: TenantContext, id: ChargeId): Promise<ChargeLine>;

  /** posted → voided. Refuses if line is on a submitted claim. */
  void(ctx: TenantContext, id: ChargeId, input: VoidChargeInput): Promise<ChargeLine>;

  /** Convenience for encounter-completion flow. */
  bulkCreateFromEncounter(
    ctx: TenantContext,
    encounterId: EncounterId,
    lines: readonly CreateChargeLineInput[],
  ): Promise<readonly ChargeLine[]>;
}

// ---------------------------------------------------------------------------
// ClaimService
// ---------------------------------------------------------------------------

export interface ClaimListFilter {
  readonly status?: readonly ClaimStatus[];
  readonly patientId?: PatientId;
  readonly payerId?: string;
  readonly serviceStartAfter?: string;
  readonly serviceEndBefore?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ClaimWithLines {
  readonly claim: Claim;
  readonly lines: readonly ClaimLine[];
  readonly history: readonly ClaimStatusHistory[];
}

export interface ClaimService {
  list(ctx: TenantContext, filter: ClaimListFilter): Promise<readonly Claim[]>;

  getById(ctx: TenantContext, id: ClaimId): Promise<ClaimWithLines | null>;

  /** Build a new claim + lines from posted charges. */
  createFromCharges(
    ctx: TenantContext,
    input: CreateClaimFromChargesInput,
  ): Promise<ClaimWithLines>;

  /** draft → ready. Validates completeness. */
  markReady(ctx: TenantContext, id: ClaimId): Promise<Claim>;

  /** ready → submitted. Calls the injected ClearinghouseSubmitter. */
  submit(ctx: TenantContext, id: ClaimId): Promise<Claim>;

  /** Apply 835 remittance. Transitions to paid | partial | denied. */
  applyRemittance(
    ctx: TenantContext,
    id: ClaimId,
    input: ApplyRemittanceInput,
  ): Promise<ClaimWithLines>;

  appeal(ctx: TenantContext, id: ClaimId, input: AppealClaimInput): Promise<Claim>;

  close(ctx: TenantContext, id: ClaimId, input: CloseClaimInput): Promise<Claim>;
}

// ---------------------------------------------------------------------------
// DenialService
// ---------------------------------------------------------------------------

export interface DenialService {
  /** Queue view: default shows open+working, oldest-first within priority. */
  list(ctx: TenantContext, filter: DenialQueueFilter): Promise<readonly Denial[]>;

  getById(ctx: TenantContext, id: DenialId): Promise<Denial | null>;

  /** Called from ClaimService.applyRemittance on line denials. */
  createFromClaim(ctx: TenantContext, input: CreateDenialInput): Promise<Denial>;

  assign(ctx: TenantContext, id: DenialId, input: AssignDenialInput): Promise<Denial>;

  recordWork(ctx: TenantContext, id: DenialId, input: RecordDenialWorkInput): Promise<Denial>;

  resolve(ctx: TenantContext, id: DenialId, input: ResolveDenialInput): Promise<Denial>;

  /** Requires billing:write_off. */
  writeOff(ctx: TenantContext, id: DenialId, input: WriteOffDenialInput): Promise<Denial>;

  appeal(ctx: TenantContext, id: DenialId, input: AppealDenialInput): Promise<Denial>;
}

// ---------------------------------------------------------------------------
// PaymentService
// ---------------------------------------------------------------------------

export interface PaymentService {
  list(ctx: TenantContext, filter: PaymentListFilter): Promise<readonly Payment[]>;

  record(ctx: TenantContext, input: RecordPaymentInput): Promise<Payment>;

  /** Creates a second payment with sign-flipped amount. Does not delete the original. */
  refund(ctx: TenantContext, id: PaymentId, input: RefundPaymentInput): Promise<Payment>;
}

// ---------------------------------------------------------------------------
// PatientBalanceService
// ---------------------------------------------------------------------------

export interface PatientBalanceService {
  /** Read or zero-fill for a specific patient. */
  get(ctx: TenantContext, patientId: PatientId): Promise<PatientBalance>;

  /** Dashboard list, paginated. */
  list(ctx: TenantContext, filter: BalanceListFilter): Promise<readonly PatientBalance[]>;

  /** Full recompute from invoices + unposted payments. Admin tool. */
  recalculate(ctx: TenantContext, patientId: PatientId): Promise<PatientBalance>;

  /** Transactional increment/decrement. Called by Payment + Charge services. */
  applyDelta(ctx: TenantContext, input: BalanceDeltaInput): Promise<PatientBalance>;
}

// ---------------------------------------------------------------------------
// Clearinghouse integration seam
// ---------------------------------------------------------------------------

export interface ClearinghouseSubmitResult {
  readonly externalClaimId: string;
  readonly ediEnvelope: string;
}

export interface ClearinghouseStatusResult {
  readonly status: ClaimStatus;
  readonly raw: unknown;
}

export interface ClearinghouseRemittance {
  readonly externalClaimId: string;
  readonly adjudicatedAt: string;
  readonly input: ApplyRemittanceInput;
}

/**
 * V1 default is a stub that throws 501. Real clearinghouse impls (Availity,
 * Change Healthcare, Claim.MD) land behind this interface — downstream code
 * never changes.
 */
export interface ClearinghouseSubmitter {
  submit837(claim: Claim, lines: readonly ClaimLine[]): Promise<ClearinghouseSubmitResult>;

  fetchStatus?(externalClaimId: string): Promise<ClearinghouseStatusResult>;

  parse835?(ediPayload: string): Promise<ClearinghouseRemittance>;
}

// ---------------------------------------------------------------------------
// Services bundle (DI entry point)
// ---------------------------------------------------------------------------

export interface BillingServices {
  readonly charges: ChargeService;
  readonly claims: ClaimService;
  readonly denials: DenialService;
  readonly payments: PaymentService;
  readonly balances: PatientBalanceService;
  readonly clearinghouse: ClearinghouseSubmitter;
}
