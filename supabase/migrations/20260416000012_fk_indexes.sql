-- =============================================================================
-- 0012 — Covering indexes on foreign keys (post-advisor fix)
-- =============================================================================
-- Postgres does not auto-index FK columns. Without a covering index, every
-- cascade delete and reverse lookup does a sequential scan. This migration
-- adds an index for every FK not already covered by a leading composite.
-- =============================================================================

create index if not exists ai_feedback_user_idx                     on public.ai_feedback (user_id);
create index if not exists allergies_recorded_by_idx                on public.allergies (recorded_by);
create index if not exists allergies_tenant_idx                     on public.allergies (tenant_id);
create index if not exists appointments_booked_by_idx               on public.appointments (booked_by);
create index if not exists appointments_encounter_idx               on public.appointments (encounter_id);
create index if not exists appointments_location_idx                on public.appointments (location_id);
create index if not exists attachments_uploaded_by_idx              on public.attachments (uploaded_by);
create index if not exists charges_order_idx                        on public.charges (order_id);
create index if not exists charges_posted_by_idx                    on public.charges (posted_by);
create index if not exists claim_lines_charge_idx                   on public.claim_lines (charge_id);
create index if not exists claim_lines_tenant_idx                   on public.claim_lines (tenant_id);
create index if not exists claim_status_history_actor_idx           on public.claim_status_history (actor_id);
create index if not exists claim_status_history_tenant_idx          on public.claim_status_history (tenant_id);
create index if not exists claims_billing_provider_idx              on public.claims (billing_provider_id);
create index if not exists claims_coverage_idx                      on public.claims (coverage_id);
create index if not exists claims_rendering_provider_idx            on public.claims (rendering_provider_id);
create index if not exists encounter_notes_ai_request_idx           on public.encounter_notes (ai_request_id);
create index if not exists encounter_notes_amended_from_idx         on public.encounter_notes (amended_from);
create index if not exists encounter_notes_author_idx               on public.encounter_notes (author_id);
create index if not exists encounter_notes_signed_by_idx            on public.encounter_notes (signed_by);
create index if not exists feature_flag_overrides_tenant_idx        on public.feature_flag_overrides (tenant_id);
create index if not exists feature_flag_overrides_user_idx          on public.feature_flag_overrides (user_id);
create index if not exists immunizations_administered_by_idx        on public.immunizations (administered_by);
create index if not exists immunizations_tenant_idx                 on public.immunizations (tenant_id);
create index if not exists integration_connections_created_by_idx   on public.integration_connections (created_by);
create index if not exists inventory_items_location_idx             on public.inventory_items (location_id);
create index if not exists inventory_transactions_performed_by_idx  on public.inventory_transactions (performed_by);
create index if not exists invitations_invited_by_idx               on public.invitations (invited_by);
create index if not exists invoice_lines_charge_idx                 on public.invoice_lines (charge_id);
create index if not exists invoice_lines_tenant_idx                 on public.invoice_lines (tenant_id);
create index if not exists medications_prescribing_provider_idx     on public.medications (prescribing_provider_id);
create index if not exists order_results_reported_by_idx            on public.order_results (reported_by);
create index if not exists patient_contacts_tenant_idx              on public.patient_contacts (tenant_id);
create index if not exists patient_coverages_tenant_idx             on public.patient_coverages (tenant_id);
create index if not exists payments_patient_idx                     on public.payments (patient_id);
create index if not exists payments_payer_idx                       on public.payments (payer_id);
create index if not exists prescriptions_medication_idx             on public.prescriptions (medication_id);
create index if not exists prescriptions_order_idx                  on public.prescriptions (order_id);
create index if not exists prescriptions_prescribing_provider_idx   on public.prescriptions (prescribing_provider_id);
create index if not exists problems_recorded_by_idx                 on public.problems (recorded_by);
create index if not exists signatures_signer_idx                    on public.signatures (signer_id);
create index if not exists staff_schedules_location_idx             on public.staff_schedules (location_id);
create index if not exists task_comments_author_idx                 on public.task_comments (author_id);
create index if not exists task_comments_tenant_idx                 on public.task_comments (tenant_id);
create index if not exists tasks_created_by_idx                     on public.tasks (created_by);
create index if not exists tasks_parent_task_idx                    on public.tasks (parent_task_id);
create index if not exists tenant_members_invited_by_idx            on public.tenant_members (invited_by);
create index if not exists vitals_recorded_by_idx                   on public.vitals (recorded_by);
create index if not exists vitals_tenant_idx                        on public.vitals (tenant_id);
create index if not exists workflow_definitions_created_by_idx      on public.workflow_definitions (created_by);
create index if not exists workflow_runs_started_by_idx             on public.workflow_runs (started_by);
