-- =============================================================================
-- 0019 — ai_scribe_code_suggestions: richer per-code payload
-- =============================================================================
-- Extends code suggestions with the fields produced by the v1 code-suggestions
-- prompt:
--   - rationale: a 1–2 sentence explanation tying the code to documented
--     findings.
--   - missing_documentation: array of items the clinician would need to
--     document to fully support the code.
--   - source: where the evidence came from (transcript | soap_only |
--     patient_context). Drives UI badge + confidence penalty.
--   - confidence: widened from flat numeric(4,3) to jsonb matching the
--     Confidence shape { model_self, grounding, combined }, uniform with the
--     SOAP section confidence stored on ai_completions.structured_output.
--
-- Safe to run because ai_scribe_code_suggestions has no rows yet (the scribe
-- pipeline is not wired up). The confidence column is dropped and recreated
-- as jsonb with a check constraint on the three expected keys and their
-- ranges.
--
-- See docs/ai-scribe.md §6 (confidence metadata) and
-- packages/ai/src/prompts/scribe/code_suggestions/CHANGELOG.md.
-- =============================================================================

alter table public.ai_scribe_code_suggestions
  add column if not exists rationale text,
  add column if not exists missing_documentation text[] not null default '{}',
  add column if not exists source text not null default 'transcript';

alter table public.ai_scribe_code_suggestions
  drop constraint if exists ai_scribe_code_suggestions_source_check;

alter table public.ai_scribe_code_suggestions
  add constraint ai_scribe_code_suggestions_source_check
    check (source in ('transcript', 'soap_only', 'patient_context'));

-- Widen confidence: numeric(4,3) → jsonb { model_self, grounding, combined }
-- No data to migrate. Drop + re-add is clearer than a type-cast dance.
alter table public.ai_scribe_code_suggestions
  drop column if exists confidence;

alter table public.ai_scribe_code_suggestions
  add column confidence jsonb not null default jsonb_build_object(
    'model_self', 0,
    'grounding',  0,
    'combined',   0
  );

alter table public.ai_scribe_code_suggestions
  drop constraint if exists ai_scribe_code_suggestions_confidence_shape;

alter table public.ai_scribe_code_suggestions
  add constraint ai_scribe_code_suggestions_confidence_shape check (
    jsonb_typeof(confidence) = 'object'
    and confidence ? 'model_self'
    and confidence ? 'grounding'
    and confidence ? 'combined'
    and (confidence->>'model_self')::numeric between 0 and 1
    and (confidence->>'grounding')::numeric between 0 and 1
    and (confidence->>'combined')::numeric between 0 and 1
  );

comment on column public.ai_scribe_code_suggestions.rationale is
  '1–2 sentence explanation from the model tying the code to documented findings. Required for physician review; null for legacy rows.';

comment on column public.ai_scribe_code_suggestions.missing_documentation is
  'Array of documentation items the clinician would need to add to fully support this code. Empty array = nothing missing.';

comment on column public.ai_scribe_code_suggestions.source is
  'Provenance of the evidence: transcript (in segments), soap_only (draft only), or patient_context (active problems / meds). Drives confidence penalty.';

comment on column public.ai_scribe_code_suggestions.confidence is
  'Three-component confidence object: model_self (model self-report), grounding (server-computed support score), combined (harmonic mean). Uniform with SOAP section confidence.';
