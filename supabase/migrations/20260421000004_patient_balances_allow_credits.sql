-- =============================================================================
-- 0023 — patient_balances: allow credits on the 0-30 bucket
-- =============================================================================
-- The original constraint required all aging buckets to be non-negative, but
-- the billing-RCM design (docs/billing-rcm.md §3.5) states that
-- `current_balance_minor` can be negative to represent a credit on account
-- (patient overpaid). Since the other constraint requires the four aging
-- buckets to SUM to `current_balance_minor`, a negative current requires at
-- least one aging bucket to be negative too.
--
-- Policy: credits live on the 0-30 bucket only (fresh activity). The older
-- buckets (31-60, 61-90, 90+) remain strictly non-negative — it's nonsensical
-- to owe the patient money "from 90+ days ago."
--
-- Applied before PaymentServiceImpl ships so overpayment flows work.
-- =============================================================================

alter table public.patient_balances
  drop constraint if exists patient_balances_aging_nonneg;

alter table public.patient_balances
  add constraint patient_balances_aging_older_nonneg check (
    aging_31_60_minor >= 0
    and aging_61_90_minor >= 0
    and aging_over_90_minor >= 0
  );

comment on column public.patient_balances.aging_0_30_minor is
  'Fresh balance bucket. Can go negative when patient has a credit on account (overpayment not yet refunded). Other aging buckets stay non-negative.';
