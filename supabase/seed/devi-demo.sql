-- =============================================================================
-- Devi demo seed — "Demo Clinic" tenant (a3586a5e-...) populated with realistic
-- clinical + billing + AI-scribe data so devi@medbrite.com and kiranthota@yahoo.com
-- can exercise every feature end-to-end.
-- =============================================================================
--
-- Idempotent: every insert uses `on conflict (...) do nothing`.
--
-- Run via:
--   supabase db query --file supabase/seed/devi-demo.sql
-- OR paste into the Supabase SQL editor on the MedPro-VitalFlow project.
--
-- IDs follow the scheme a35dTTXX-... where TT is a table code:
--   00 patients  01 encounters  02 notes  03 diagnosis_assignments
--   04 allergies 05 medications 06 payers 07 patient_coverages
--   08 charges   09 claims      0a claim_lines  0b claim_status_history
--   0c denials   0d payments    0e patient_balances
--   0f ai_requests  10 ai_completions  11 ai_scribe_sessions
--   12 ai_scribe_transcript_segments   13 ai_scribe_code_suggestions
--   15 appointments
--
-- Actors:
--   DEVI   b3baba9e-770b-4f9a-a846-2305cdee095a  (devi@medbrite.com)
--   KIRAN  79ddf2bf-4501-4ef0-8da5-c66ca88e7df2  (kiranthota@yahoo.com)
-- =============================================================================

-- BAA flip — PHI writes are blocked when hipaa_baa_signed=false. Demo tenant only.
update public.tenants
   set hipaa_baa_signed = true,
       updated_at = now()
 where id = 'a3586a5e-1ae4-495b-8998-dee9c0fbb255';

-- ---------- Payers ---------------------------------------------------------
insert into public.payers (id, tenant_id, name, payer_code, edi_sender_id, active)
values
  ('a35d0601-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'Blue Cross Blue Shield PPO', 'BCBS-PPO', 'BCBS837', true),
  ('a35d0602-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'Aetna Commercial', 'AETNA', 'AETNA837', true),
  ('a35d0603-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'Medicare Part B', 'MCR-B', 'MCR837', true)
on conflict (id) do nothing;

-- ---------- Patients -------------------------------------------------------
insert into public.patients (
  id, tenant_id, mrn, given_name, family_name, preferred_name,
  date_of_birth, sex_at_birth, pronouns, preferred_language
)
values
  ('a35d0001-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'DEVI-10001', 'Maria', 'Gonzalez', 'Maria', '1979-03-14', 'female', 'she/her', 'en-US'),
  ('a35d0002-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'DEVI-10002', 'James', 'O''Brien', 'Jim', '1956-11-02', 'male', 'he/him', 'en-US'),
  ('a35d0003-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'DEVI-10003', 'Priya', 'Patel', null, '1991-06-22', 'female', 'she/her', 'en-US'),
  ('a35d0004-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'DEVI-10004', 'Daniel', 'Chen', 'Dan', '1984-09-08', 'male', 'he/him', 'en-US'),
  ('a35d0005-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'DEVI-10005', 'Aaliyah', 'Washington', null, '2010-01-30', 'female', 'she/her', 'en-US')
on conflict (id) do nothing;

-- ---------- Encounters -----------------------------------------------------
insert into public.encounters (
  id, tenant_id, patient_id, provider_id, class, status, reason,
  start_at, end_at, location, chief_complaint
)
values
  ('a35d0101-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'ambulatory', 'finished', 'Sore throat, fever x 3 days',
   (now() - interval '1 day')::timestamptz,
   (now() - interval '1 day' + interval '30 min')::timestamptz,
   'Exam Room 2', 'Sore throat and fever'),
  ('a35d0102-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2',
   'ambulatory', 'finished', 'Annual wellness visit',
   (now() - interval '14 days')::timestamptz,
   (now() - interval '14 days' + interval '45 min')::timestamptz,
   'Exam Room 1', 'Routine annual physical'),
  ('a35d0103-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'telehealth', 'in_progress', 'Headache follow-up',
   (now() - interval '10 min')::timestamptz, null,
   'Zoom', 'Recurrent migraines'),
  ('a35d0104-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'ambulatory', 'arrived', 'Lower back pain',
   (now() - interval '75 min')::timestamptz, null,
   'Waiting Room', 'Acute lower back pain after lifting'),
  ('a35d0105-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0005-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'ambulatory', 'planned', 'Well-child visit, age 16',
   (date_trunc('day', now()) + interval '1 day' + interval '9 hours')::timestamptz, null,
   'Exam Room 3', 'Annual well-child checkup'),
  ('a35d0106-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'ambulatory', 'planned', 'Strep throat follow-up',
   (date_trunc('day', now()) + interval '7 days' + interval '14 hours')::timestamptz, null,
   'Exam Room 2', 'Strep follow-up')
on conflict (id) do nothing;

-- ---------- Appointments (per-provider no-overlap constraint applies) ------
insert into public.appointments (
  id, tenant_id, patient_id, provider_id, start_at, end_at, status,
  reason, visit_type, booked_by
)
values
  -- Daniel arrived 75 min ago (30-min slot, running late)
  ('a35d1501-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   (now() - interval '75 min')::timestamptz, (now() - interval '45 min')::timestamptz,
   'arrived', 'Lower back pain', 'in-person',
   'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  -- Priya telehealth currently in progress
  ('a35d1502-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   (now() - interval '10 min')::timestamptz, (now() + interval '20 min')::timestamptz,
   'in_progress', 'Headache follow-up', 'telehealth',
   'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  -- Tomorrow morning
  ('a35d1503-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0005-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   (date_trunc('day', now()) + interval '1 day' + interval '9 hours')::timestamptz,
   (date_trunc('day', now()) + interval '1 day' + interval '9 hours 30 min')::timestamptz,
   'confirmed', 'Annual well-child checkup', 'in-person',
   'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  -- Next week
  ('a35d1504-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   (date_trunc('day', now()) + interval '7 days' + interval '14 hours')::timestamptz,
   (date_trunc('day', now()) + interval '7 days' + interval '14 hours 30 min')::timestamptz,
   'scheduled', 'Strep follow-up', 'in-person',
   'b3baba9e-770b-4f9a-a846-2305cdee095a')
on conflict (id) do nothing;

-- ---------- Signed SOAP notes ----------------------------------------------
insert into public.encounter_notes (
  id, tenant_id, encounter_id, patient_id, author_id, type, status,
  subjective, objective, assessment, plan, ai_assisted, signed_by, signed_at, version
)
values
  ('a35d0201-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0101-0000-0000-0000-000000000000', 'a35d0001-0000-0000-0000-000000000000',
   'b3baba9e-770b-4f9a-a846-2305cdee095a', 'soap', 'signed',
   'Pt reports 3 days of sore throat, subjective fever to 101F, mild headache. No cough, no GI symptoms. No recent sick contacts at work; daughter had similar symptoms last week.',
   'T 100.8F, HR 92, BP 118/74, SpO2 99% on RA. Oropharynx erythematous with bilateral tonsillar exudate. Tender anterior cervical lymphadenopathy. Lungs clear. Rapid strep positive.',
   '1. Streptococcal pharyngitis (J02.0) — confirmed by rapid strep. 2. Low-grade fever (R50.9) — secondary to streptococcal infection.',
   '1. Amoxicillin 500 mg PO BID x 10 days. 2. Symptomatic care: fluids, rest, acetaminophen PRN. 3. Return if symptoms worsen or do not improve in 48-72h. 4. Follow-up in 1 week.',
   true, 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   (now() - interval '23 hours')::timestamptz, 1),
  ('a35d0202-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0102-0000-0000-0000-000000000000', 'a35d0002-0000-0000-0000-000000000000',
   '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', 'soap', 'signed',
   'Pt here for annual wellness visit. Feels well overall. Reports occasional knee pain with prolonged walking. No chest pain, no SOB, no weight changes.',
   'T 98.4F, HR 68, BP 128/78, BMI 27.4. HEENT normal. Cardiac: RRR, no murmurs. Pulm: clear. MSK: mild crepitus R knee, full ROM. A1C 5.8, LDL 142.',
   '1. Essential hypertension (I10) — stable on current regimen. 2. Mild osteoarthritis, right knee (M17.11). 3. Borderline dyslipidemia — LDL 142.',
   '1. Continue lisinopril 10 mg daily. 2. Recheck BP in 3 months. 3. Dietary counseling — referral to RD. 4. Colonoscopy overdue, will schedule. 5. PT evaluation for knee.',
   false, '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2',
   (now() - interval '13 days 23 hours')::timestamptz, 1)
on conflict (id) do nothing;

-- ---------- Diagnoses / allergies / meds -----------------------------------
insert into public.diagnosis_assignments (
  id, tenant_id, patient_id, encounter_id, code_system, code, description, rank, pointer, assigned_by
)
values
  ('a35d0301-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'icd10-cm', 'J02.0', 'Streptococcal pharyngitis', 1, 'A', 'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  ('a35d0302-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'icd10-cm', 'R50.9', 'Fever, unspecified', 2, 'B', 'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  ('a35d0303-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0102-0000-0000-0000-000000000000',
   'icd10-cm', 'I10', 'Essential (primary) hypertension', 1, 'A', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2'),
  ('a35d0304-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0102-0000-0000-0000-000000000000',
   'icd10-cm', 'M17.11', 'Unilateral primary osteoarthritis, right knee', 2, 'B', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2')
on conflict (id) do nothing;

insert into public.allergies (
  id, tenant_id, patient_id, type, substance, substance_code,
  reaction, severity, onset_date, recorded_by
)
values
  ('a35d0401-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'medication', 'Penicillin', 'RXNORM:7980',
   'Hives, facial swelling', 'moderate', '2015-08-01', 'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  ('a35d0402-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'medication', 'Sulfa drugs', null,
   'Rash', 'mild', '2002-03-15', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2'),
  ('a35d0403-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 'food', 'Shellfish', null,
   'Anaphylaxis', 'life_threatening', '2008-07-20', 'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  ('a35d0404-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'environmental', 'Bee stings', null,
   'Localized swelling', 'moderate', null, 'b3baba9e-770b-4f9a-a846-2305cdee095a')
on conflict (id) do nothing;

insert into public.medications (
  id, tenant_id, patient_id, rxnorm_code, display_name, dose, route, frequency,
  status, start_date, prescribing_provider_id
)
values
  ('a35d0501-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', '723', 'Amoxicillin', '500 mg', 'PO', 'BID',
   'active', (current_date - 1), 'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  ('a35d0502-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', '29046', 'Lisinopril', '10 mg', 'PO', 'QD',
   'active', '2022-06-01', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2'),
  ('a35d0503-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', '83367', 'Atorvastatin', '20 mg', 'PO', 'QHS',
   'active', '2023-11-15', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2'),
  ('a35d0504-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', '6845', 'Sumatriptan', '50 mg', 'PO', 'PRN for migraine',
   'active', '2024-01-10', 'b3baba9e-770b-4f9a-a846-2305cdee095a'),
  ('a35d0505-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', '5640', 'Ibuprofen', '600 mg', 'PO', 'TID with food',
   'active', (current_date - 3), 'b3baba9e-770b-4f9a-a846-2305cdee095a')
on conflict (id) do nothing;

-- ---------- Patient coverages ----------------------------------------------
insert into public.patient_coverages (
  id, tenant_id, patient_id, payer_id, type, plan_name, member_id,
  group_number, subscriber_name, relationship, effective_start, copay_minor, currency, active
)
values
  ('a35d0701-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0601-0000-0000-0000-000000000000',
   'primary', 'BCBS PPO Gold', 'BCBS-M-1001', 'GRP-77701', 'Maria Gonzalez', 'self',
   '2026-01-01', 2500, 'USD', true),
  ('a35d0702-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0603-0000-0000-0000-000000000000',
   'primary', 'Medicare Part B', 'MCR-1A2B3C4D', null, 'James O''Brien', 'self',
   '2021-12-01', 0, 'USD', true),
  ('a35d0703-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 'a35d0602-0000-0000-0000-000000000000',
   'primary', 'Aetna HMO Select', 'AET-3003', 'GRP-AET-12', 'Priya Patel', 'self',
   '2026-01-01', 3000, 'USD', true),
  ('a35d0704-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'a35d0601-0000-0000-0000-000000000000',
   'primary', 'BCBS PPO Silver', 'BCBS-M-1004', 'GRP-77702', 'Daniel Chen', 'self',
   '2026-01-01', 3500, 'USD', true),
  ('a35d0705-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0005-0000-0000-0000-000000000000', 'a35d0601-0000-0000-0000-000000000000',
   'primary', 'BCBS PPO Family', 'BCBS-F-8844', 'GRP-77703', 'Linda Washington', 'child',
   '2026-01-01', 2000, 'USD', true)
on conflict (id) do nothing;

-- ---------- Charges --------------------------------------------------------
insert into public.charges (
  id, tenant_id, patient_id, encounter_id, cpt_code, icd10_codes, modifiers,
  units, unit_price_minor, currency, service_date, posted_at, posted_by, status
)
values
  ('a35d0801-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   '99213', ARRAY['J02.0'], ARRAY['25']::text[], 1, 12500, 'USD', (current_date - 1),
   (now() - interval '23 hours'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0802-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   '87880', ARRAY['J02.0'], ARRAY[]::text[], 1, 4500, 'USD', (current_date - 1),
   (now() - interval '23 hours'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0803-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   '85025', ARRAY['R50.9'], ARRAY[]::text[], 1, 3500, 'USD', (current_date - 1),
   (now() - interval '23 hours'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0811-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0102-0000-0000-0000-000000000000',
   '99396', ARRAY['Z00.00'], ARRAY[]::text[], 1, 22500, 'USD', (current_date - 14),
   (now() - interval '13 days 23 hours'), '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', 'posted'),
  ('a35d0812-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0102-0000-0000-0000-000000000000',
   '93000', ARRAY['I10'], ARRAY[]::text[], 1, 7500, 'USD', (current_date - 14),
   (now() - interval '13 days 23 hours'), '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', 'posted'),
  ('a35d0813-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0102-0000-0000-0000-000000000000',
   '80061', ARRAY['I10'], ARRAY[]::text[], 1, 4200, 'USD', (current_date - 14),
   (now() - interval '13 days 23 hours'), '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', 'posted'),
  ('a35d0821-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 'a35d0103-0000-0000-0000-000000000000',
   '99214', ARRAY['G43.909'], ARRAY['95']::text[], 1, 17500, 'USD', current_date,
   now(), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0831-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'a35d0104-0000-0000-0000-000000000000',
   '99213', ARRAY['M54.50'], ARRAY[]::text[], 1, 12500, 'USD', current_date,
   now(), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0832-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'a35d0104-0000-0000-0000-000000000000',
   '72100', ARRAY['M54.50'], ARRAY[]::text[], 1, 8900, 'USD', current_date,
   null, null, 'draft'),
  ('a35d0841-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', null,
   '99213', ARRAY['R51.9'], ARRAY[]::text[], 1, 12500, 'USD', (current_date - 35),
   (now() - interval '35 days'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0842-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', null,
   '99213', ARRAY['M79.1'], ARRAY[]::text[], 1, 12500, 'USD', (current_date - 70),
   (now() - interval '70 days'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'posted'),
  ('a35d0851-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 'a35d0103-0000-0000-0000-000000000000',
   '90471', ARRAY['Z23'], ARRAY[]::text[], 1, 2500, 'USD', current_date,
   null, null, 'draft'),
  ('a35d0852-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0005-0000-0000-0000-000000000000', null,
   '99395', ARRAY['Z00.129'], ARRAY[]::text[], 1, 19500, 'USD', (current_date + 1),
   null, null, 'draft')
on conflict (id) do nothing;

-- ---------- Claims + lines + status history --------------------------------
insert into public.claims (
  id, tenant_id, patient_id, payer_id, coverage_id, number, status,
  billing_provider_id, rendering_provider_id, service_start_date, service_end_date,
  total_minor, allowed_minor, paid_minor, patient_resp_minor, currency,
  submitted_at, adjudicated_at, external_claim_id, metadata
)
values
  ('a35d0901-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0603-0000-0000-0000-000000000000',
   'a35d0702-0000-0000-0000-000000000000', 'CLM-DEVI-000001', 'paid',
   '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2',
   (current_date - 14), (current_date - 14), 34200, 30800, 30800, 0, 'USD',
   (now() - interval '13 days'), (now() - interval '5 days'),
   'MCR-EXT-88001', jsonb_build_object('demo', true)),
  ('a35d0902-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 'a35d0601-0000-0000-0000-000000000000',
   'a35d0701-0000-0000-0000-000000000000', 'CLM-DEVI-000002', 'submitted',
   'b3baba9e-770b-4f9a-a846-2305cdee095a', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   (current_date - 1), (current_date - 1), 20500, null, null, null, 'USD',
   (now() - interval '20 hours'), null, null, jsonb_build_object('demo', true)),
  ('a35d0903-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 'a35d0601-0000-0000-0000-000000000000',
   'a35d0704-0000-0000-0000-000000000000', 'CLM-DEVI-000003', 'ready',
   'b3baba9e-770b-4f9a-a846-2305cdee095a', 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   current_date, current_date, 12500, null, null, null, 'USD',
   null, null, null, jsonb_build_object('demo', true))
on conflict (id) do nothing;

insert into public.claim_lines (
  id, tenant_id, claim_id, charge_id, line_number, cpt_code, modifiers,
  icd10_codes, units, charge_minor, allowed_minor, paid_minor, adjustment_minor,
  currency, service_date
)
values
  ('a35d0a01-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'a35d0811-0000-0000-0000-000000000000',
   1, '99396', ARRAY[]::text[], ARRAY['Z00.00'], 1, 22500, 20000, 20000, 2500, 'USD', (current_date - 14)),
  ('a35d0a02-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'a35d0812-0000-0000-0000-000000000000',
   2, '93000', ARRAY[]::text[], ARRAY['I10'], 1, 7500, 6800, 6800, 700, 'USD', (current_date - 14)),
  ('a35d0a03-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'a35d0813-0000-0000-0000-000000000000',
   3, '80061', ARRAY[]::text[], ARRAY['I10'], 1, 4200, 4000, 4000, 200, 'USD', (current_date - 14)),
  ('a35d0a11-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'a35d0801-0000-0000-0000-000000000000',
   1, '99213', ARRAY['25'], ARRAY['J02.0'], 1, 12500, null, null, null, 'USD', (current_date - 1)),
  ('a35d0a12-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'a35d0802-0000-0000-0000-000000000000',
   2, '87880', ARRAY[]::text[], ARRAY['J02.0'], 1, 4500, null, null, null, 'USD', (current_date - 1)),
  ('a35d0a13-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'a35d0803-0000-0000-0000-000000000000',
   3, '85025', ARRAY[]::text[], ARRAY['R50.9'], 1, 3500, null, null, null, 'USD', (current_date - 1)),
  ('a35d0a21-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0903-0000-0000-0000-000000000000', 'a35d0831-0000-0000-0000-000000000000',
   1, '99213', ARRAY[]::text[], ARRAY['M54.50'], 1, 12500, null, null, null, 'USD', current_date)
on conflict (id) do nothing;

insert into public.claim_status_history (
  id, tenant_id, claim_id, from_status, to_status, occurred_at, actor_id, message
)
values
  ('a35d0b01-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', null, 'draft',
   (now() - interval '13 days 23 hours'), '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', 'Claim created from encounter charges'),
  ('a35d0b02-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'draft', 'ready',
   (now() - interval '13 days 22 hours'), '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', null),
  ('a35d0b03-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'ready', 'submitted',
   (now() - interval '13 days 21 hours'), '79ddf2bf-4501-4ef0-8da5-c66ca88e7df2', 'Submitted to Medicare'),
  ('a35d0b04-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'submitted', 'accepted',
   (now() - interval '8 days'), null, 'Clearinghouse acknowledgment'),
  ('a35d0b05-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0901-0000-0000-0000-000000000000', 'accepted', 'paid',
   (now() - interval '5 days'), null, 'Payment $308.00 — paid in full'),
  ('a35d0b11-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', null, 'draft',
   (now() - interval '23 hours'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'Claim created from encounter charges'),
  ('a35d0b12-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'draft', 'ready',
   (now() - interval '22 hours'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', null),
  ('a35d0b13-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'ready', 'submitted',
   (now() - interval '20 hours'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'Submitted to BCBS'),
  ('a35d0b21-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0903-0000-0000-0000-000000000000', null, 'draft',
   (now() - interval '30 min'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'Claim created from encounter charges'),
  ('a35d0b22-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0903-0000-0000-0000-000000000000', 'draft', 'ready',
   (now() - interval '5 min'), 'b3baba9e-770b-4f9a-a846-2305cdee095a', 'Ready for submission')
on conflict (id) do nothing;

-- ---------- Denials / payments / balances ----------------------------------
insert into public.denials (
  id, tenant_id, claim_id, claim_line_id, denial_codes, reason_text,
  status, priority, denied_amount_minor, currency
)
values
  ('a35d0c01-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'a35d0a12-0000-0000-0000-000000000000',
   ARRAY['CO-16', 'N704'],
   'Missing documentation: streptococcal test result not attached to claim',
   'open', 2, 4500, 'USD'),
  ('a35d0c02-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0902-0000-0000-0000-000000000000', 'a35d0a13-0000-0000-0000-000000000000',
   ARRAY['CO-97'],
   'Procedure bundled under primary E/M service — duplicate payment not allowed',
   'working', 3, 3500, 'USD')
on conflict (id) do nothing;

insert into public.payments (
  id, tenant_id, patient_id, payer_id, method, amount_minor, currency,
  received_at, reference, processor
)
values
  ('a35d0d01-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 'a35d0603-0000-0000-0000-000000000000',
   'insurance', 30800, 'USD', (now() - interval '5 days'), 'ERA-MCR-88001', 'clearinghouse'),
  ('a35d0d02-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', null,
   'card', 2500, 'USD', (now() - interval '23 hours'), 'stripe-ch-devi-001', 'stripe'),
  ('a35d0d03-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', null,
   'card', 3000, 'USD', (now() - interval '12 min'), 'stripe-ch-devi-002', 'stripe'),
  ('a35d0d04-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', null,
   'cash', 3500, 'USD', (now() - interval '50 min'), 'receipt-devi-0042', null)
on conflict (id) do nothing;

insert into public.patient_balances (
  id, tenant_id, patient_id, current_balance_minor,
  aging_0_30_minor, aging_31_60_minor, aging_61_90_minor, aging_over_90_minor,
  currency, last_payment_at
)
values
  ('a35d0e01-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0001-0000-0000-0000-000000000000', 18000, 18000, 0, 0, 0, 'USD',
   (now() - interval '23 hours')),
  ('a35d0e02-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0002-0000-0000-0000-000000000000', 3400, 3400, 0, 0, 0, 'USD',
   (now() - interval '5 days')),
  ('a35d0e03-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0003-0000-0000-0000-000000000000', 27000, 14500, 12500, 0, 0, 'USD',
   (now() - interval '12 min')),
  ('a35d0e04-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0004-0000-0000-0000-000000000000', 21500, 9000, 0, 12500, 0, 'USD',
   (now() - interval '50 min')),
  ('a35d0e05-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0005-0000-0000-0000-000000000000', 0, 0, 0, 0, 0, 'USD', null)
on conflict (tenant_id, patient_id) do update set
  current_balance_minor  = excluded.current_balance_minor,
  aging_0_30_minor       = excluded.aging_0_30_minor,
  aging_31_60_minor      = excluded.aging_31_60_minor,
  aging_61_90_minor      = excluded.aging_61_90_minor,
  aging_over_90_minor    = excluded.aging_over_90_minor,
  last_payment_at        = excluded.last_payment_at,
  updated_at             = now();

-- ---------- AI scribe ------------------------------------------------------
insert into public.ai_requests (
  id, tenant_id, user_id, surface, provider, model, status,
  prompt_hash, prompt_tokens, safety_verdict,
  started_at, completed_at, cost_micros_usd, correlation_id
)
values
  ('a35d0f01-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'b3baba9e-770b-4f9a-a846-2305cdee095a', 'scribe.soap', 'anthropic', 'claude-opus-4-6', 'completed',
   'devi-hash-001', 1400, 'pass',
   (now() - interval '1 day 30 min'), (now() - interval '1 day 29 min'), 24500, 'devi-scribe-maria-001'),
  ('a35d0f02-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'b3baba9e-770b-4f9a-a846-2305cdee095a', 'scribe.codes', 'anthropic', 'claude-opus-4-6', 'completed',
   'devi-hash-002', 1100, 'pass',
   (now() - interval '1 day 28 min'), (now() - interval '1 day 27 min'), 18500, 'devi-scribe-maria-002')
on conflict (id) do nothing;

insert into public.ai_completions (
  id, tenant_id, request_id, content, completion_tokens, total_tokens,
  finish_reason, latency_ms, prompt_id, prompt_version, created_at
)
values
  ('a35d1001-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0f01-0000-0000-0000-000000000000',
   '{"subjective":"Pt reports 3 days of sore throat, subjective fever to 101F, mild headache. No cough, no GI symptoms. Daughter had similar symptoms last week.","objective":"T 100.8F, HR 92, BP 118/74. Oropharynx erythematous with bilateral tonsillar exudate. Anterior cervical lymphadenopathy. Rapid strep positive.","assessment":"1. Streptococcal pharyngitis (J02.0). 2. Low-grade fever (R50.9).","plan":"1. Amoxicillin 500 mg PO BID x 10 days. 2. Symptomatic care, fluids, rest. 3. Return if not improving in 48-72h. 4. Follow-up in 1 week."}',
   720, 2120, 'stop', 48000, 'scribe.soap', '1.0.0',
   (now() - interval '1 day 29 min')),
  ('a35d1002-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0f02-0000-0000-0000-000000000000',
   '{"diagnoses":[{"code":"J02.0","description":"Streptococcal pharyngitis","rank":1},{"code":"R50.9","description":"Fever, unspecified","rank":2}],"procedures":[{"code":"99213","description":"Office visit, established, low complexity","rank":1},{"code":"87880","description":"Rapid strep test","rank":2},{"code":"85025","description":"CBC with differential","rank":3}]}',
   410, 1510, 'stop', 32000, 'scribe.codes', '1.0.0',
   (now() - interval '1 day 27 min'))
on conflict (id) do nothing;

insert into public.ai_scribe_sessions (
  id, tenant_id, encounter_id, patient_id, created_by, source, status,
  generate_request_id, suggest_request_id, accepted_note_id,
  total_cost_micros_usd, total_latency_ms, metadata, created_at, updated_at
)
values
  ('a35d1101-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d0101-0000-0000-0000-000000000000', 'a35d0001-0000-0000-0000-000000000000',
   'b3baba9e-770b-4f9a-a846-2305cdee095a', 'transcript_paste', 'accepted',
   'a35d0f01-0000-0000-0000-000000000000', 'a35d0f02-0000-0000-0000-000000000000',
   'a35d0201-0000-0000-0000-000000000000',
   43000, 80000, jsonb_build_object('demo', true),
   (now() - interval '1 day 31 min'), (now() - interval '23 hours'))
on conflict (id) do nothing;

insert into public.ai_scribe_transcript_segments (
  id, tenant_id, session_id, sequence_index, start_ms, end_ms, speaker, text, partial
)
values
  ('a35d1201-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 1, 0, 3200, 'provider',
   'Hi Maria, what brings you in today?', false),
  ('a35d1202-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 2, 3200, 9500, 'patient',
   'I have had this terrible sore throat for three days now and a fever.', false),
  ('a35d1203-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 3, 9500, 13000, 'provider',
   'How high has the fever been?', false),
  ('a35d1204-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 4, 13000, 20000, 'patient',
   'It got up to 101 yesterday. My daughter had the same thing last week.', false),
  ('a35d1205-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 5, 20000, 26000, 'provider',
   'Let me take a look. Your throat is quite red with white patches, and your glands are swollen. I will run a rapid strep test.', false),
  ('a35d1206-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 6, 26000, 32000, 'provider',
   'The test is positive. This is strep throat. I will prescribe amoxicillin twice a day for ten days. Any penicillin allergies?', false),
  ('a35d1207-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 7, 32000, 36000, 'patient',
   'Yes, actually. Penicillin gives me hives.', false),
  ('a35d1208-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 8, 36000, 42000, 'provider',
   'Good that you told me. I will switch to azithromycin instead. Follow up in one week.', false)
on conflict (id) do nothing;

insert into public.ai_scribe_code_suggestions (
  id, tenant_id, session_id, encounter_id, type, code_system, code,
  description, rank, accepted_at, accepted_by, rationale, source, confidence
)
values
  ('a35d1301-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'diagnosis', 'icd10-cm', 'J02.0', 'Streptococcal pharyngitis', 1,
   (now() - interval '23 hours 5 min'), 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'Rapid strep test positive, classic pharyngeal findings (erythema, exudate, adenopathy).',
   'transcript', jsonb_build_object('model_self', 0.96, 'grounding', 0.92, 'combined', 0.94)),
  ('a35d1302-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'diagnosis', 'icd10-cm', 'R50.9', 'Fever, unspecified', 2,
   (now() - interval '23 hours 5 min'), 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'Documented temperature 100.8F during encounter; secondary to infection.',
   'transcript', jsonb_build_object('model_self', 0.84, 'grounding', 0.88, 'combined', 0.86)),
  ('a35d1303-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'procedure', 'cpt', '99213', 'Office visit, established, low complexity', 1,
   (now() - interval '23 hours 5 min'), 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'Established pt, one stable problem, straightforward medical decision making.',
   'transcript', jsonb_build_object('model_self', 0.91, 'grounding', 0.87, 'combined', 0.89)),
  ('a35d1304-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'procedure', 'cpt', '87880', 'Rapid strep test', 2,
   (now() - interval '23 hours 5 min'), 'b3baba9e-770b-4f9a-a846-2305cdee095a',
   'Rapid strep test performed in office.',
   'transcript', jsonb_build_object('model_self', 0.98, 'grounding', 0.95, 'combined', 0.97)),
  ('a35d1305-0000-0000-0000-000000000000', 'a3586a5e-1ae4-495b-8998-dee9c0fbb255',
   'a35d1101-0000-0000-0000-000000000000', 'a35d0101-0000-0000-0000-000000000000',
   'diagnosis', 'icd10-cm', 'J18.9', 'Pneumonia, unspecified organism', 3,
   null, null,
   'Possible pulmonary involvement given fever + cough.',
   'transcript', jsonb_build_object('model_self', 0.52, 'grounding', 0.31, 'combined', 0.42))
on conflict (id) do nothing;

update public.ai_scribe_code_suggestions
   set rejected_at = (now() - interval '23 hours 4 min')
 where id = 'a35d1305-0000-0000-0000-000000000000'
   and rejected_at is null;

update public.encounter_notes
   set ai_request_id = 'a35d0f01-0000-0000-0000-000000000000'
 where id = 'a35d0201-0000-0000-0000-000000000000'
   and ai_request_id is null;
