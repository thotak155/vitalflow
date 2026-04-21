-- =============================================================================
-- Billing sample seed — V1 RCM domain demo data
-- =============================================================================
-- PHI-free demo data for local / staging. NOT loaded by `supabase db reset`
-- automatically — run manually against a dev project:
--
--   supabase db query --file supabase/seed/billing-sample.sql
--
-- OR paste into the Supabase SQL editor on a dev branch.
--
-- Assumes a demo tenant + at least one patient + encounter already exist.
-- Set the variables below to match your dev DB.
-- =============================================================================

-- Configure these to match your dev data before running:
-- TENANT_ID, PATIENT_ID, ENCOUNTER_ID, PROVIDER_USER_ID
\set tenant_id         '''00000000-0000-0000-0000-000000000001'''
\set patient_id        '''00000000-0000-0000-0000-000000000010'''
\set encounter_id      '''00000000-0000-0000-0000-000000000100'''
\set provider_user_id  '''00000000-0000-0000-0000-000000000002'''

-- ---------- Payers ----------------------------------------------------------

insert into public.payers (id, tenant_id, name, payer_code, edi_sender_id, active)
values
  ('11111111-1111-1111-1111-111111111001', :tenant_id, 'Demo Commercial Payer', 'DEMO-COM', 'DEMO837', true),
  ('11111111-1111-1111-1111-111111111002', :tenant_id, 'Demo Medicare', 'DEMO-MCR', 'DEMO837', true)
on conflict (id) do nothing;

-- ---------- Patient coverage ------------------------------------------------

insert into public.patient_coverages (
  id, tenant_id, patient_id, payer_id, type, plan_name, member_id,
  effective_start, copay_minor, currency, active
)
values (
  '22222222-2222-2222-2222-222222222001', :tenant_id, :patient_id,
  '11111111-1111-1111-1111-111111111001',
  'primary', 'PPO Gold', 'M-DEMO-001', '2026-01-01', 2500, 'USD', true
)
on conflict (id) do nothing;

-- ---------- Charges (3 posted lines on one encounter) -----------------------

insert into public.charges (
  id, tenant_id, patient_id, encounter_id, cpt_code, icd10_codes,
  modifiers, units, unit_price_minor, currency, service_date,
  posted_at, posted_by, status
)
values
  (
    '33333333-3333-3333-3333-333333333001', :tenant_id, :patient_id, :encounter_id,
    '99213', ARRAY['J02.9'], ARRAY['25']::text[], 1, 12500, 'USD', '2026-04-20',
    '2026-04-20T14:00:00Z', :provider_user_id, 'posted'
  ),
  (
    '33333333-3333-3333-3333-333333333002', :tenant_id, :patient_id, :encounter_id,
    '87430', ARRAY['J02.9'], ARRAY[]::text[], 1, 4500, 'USD', '2026-04-20',
    '2026-04-20T14:05:00Z', :provider_user_id, 'posted'
  ),
  (
    '33333333-3333-3333-3333-333333333003', :tenant_id, :patient_id, :encounter_id,
    '85025', ARRAY['R50.9'], ARRAY[]::text[], 1, 3500, 'USD', '2026-04-20',
    '2026-04-20T14:10:00Z', :provider_user_id, 'draft'
  )
on conflict (id) do nothing;

-- ---------- Claim + lines ---------------------------------------------------

insert into public.claims (
  id, tenant_id, patient_id, payer_id, coverage_id, number, status,
  billing_provider_id, rendering_provider_id, service_start_date, service_end_date,
  total_minor, currency, metadata
)
values (
  '44444444-4444-4444-4444-444444444001', :tenant_id, :patient_id,
  '11111111-1111-1111-1111-111111111001', '22222222-2222-2222-2222-222222222001',
  'CLM-2026-000001', 'submitted',
  :provider_user_id, :provider_user_id,
  '2026-04-20', '2026-04-20', 17000, 'USD', '{}'::jsonb
)
on conflict (id) do nothing;

insert into public.claim_lines (
  id, tenant_id, claim_id, charge_id, line_number, cpt_code,
  modifiers, icd10_codes, units, charge_minor, currency, service_date
)
values
  (
    '44444444-4444-4444-4444-444444444101', :tenant_id,
    '44444444-4444-4444-4444-444444444001', '33333333-3333-3333-3333-333333333001',
    1, '99213', ARRAY['25'], ARRAY['J02.9'], 1, 12500, 'USD', '2026-04-20'
  ),
  (
    '44444444-4444-4444-4444-444444444102', :tenant_id,
    '44444444-4444-4444-4444-444444444001', '33333333-3333-3333-3333-333333333002',
    2, '87430', ARRAY[]::text[], ARRAY['J02.9'], 1, 4500, 'USD', '2026-04-20'
  )
on conflict (id) do nothing;

insert into public.claim_status_history (
  id, tenant_id, claim_id, from_status, to_status, occurred_at, actor_id, message
)
values
  (
    '55555555-5555-5555-5555-555555555001', :tenant_id,
    '44444444-4444-4444-4444-444444444001',
    null, 'draft', '2026-04-20T14:15:00Z', :provider_user_id, 'Claim created'
  ),
  (
    '55555555-5555-5555-5555-555555555002', :tenant_id,
    '44444444-4444-4444-4444-444444444001',
    'draft', 'ready', '2026-04-20T14:20:00Z', :provider_user_id, null
  ),
  (
    '55555555-5555-5555-5555-555555555003', :tenant_id,
    '44444444-4444-4444-4444-444444444001',
    'ready', 'submitted', '2026-04-20T14:25:00Z', :provider_user_id, 'Stub submission'
  )
on conflict (id) do nothing;

-- ---------- Denial (on the $45 lab line) ------------------------------------

insert into public.denials (
  id, tenant_id, claim_id, claim_line_id, denial_codes, reason_text,
  status, priority, denied_amount_minor, currency
)
values (
  '66666666-6666-6666-6666-666666666001', :tenant_id,
  '44444444-4444-4444-4444-444444444001',
  '44444444-4444-4444-4444-444444444102',
  ARRAY['CO-16', 'N704'],
  'Missing documentation: streptococcal test result not attached',
  'open', 2, 4500, 'USD'
)
on conflict (id) do nothing;

-- ---------- Payment (partial patient copay) ---------------------------------
-- Invoice is NOT seeded here — payments can be tied to a patient without
-- an invoice in V1 (invoice-less cash bucket). A real workflow writes the
-- invoice first, then the payment.

insert into public.payments (
  id, tenant_id, patient_id, method, amount_minor, currency, received_at, reference
)
values (
  '77777777-7777-7777-7777-777777777001', :tenant_id, :patient_id,
  'card', 2500, 'USD', '2026-04-20T14:30:00Z', 'demo-auth-0001'
)
on conflict (id) do nothing;

-- ---------- Patient balance rollup ------------------------------------------
-- After 3 charges totaling $170 and $25 patient payment:
--   current = 12500 + 4500 + 3500 - 2500 = 18000 minor ($180)
-- All in 0-30 aging bucket (charges just posted today).

insert into public.patient_balances (
  id, tenant_id, patient_id, current_balance_minor, aging_0_30_minor,
  currency, last_payment_at
)
values (
  '88888888-8888-8888-8888-888888888001', :tenant_id, :patient_id,
  18000, 18000, 'USD', '2026-04-20T14:30:00Z'
)
on conflict (tenant_id, patient_id) do update set
  current_balance_minor = excluded.current_balance_minor,
  aging_0_30_minor      = excluded.aging_0_30_minor,
  last_payment_at       = excluded.last_payment_at,
  updated_at            = now();
