-- =============================================================================
-- 0018 — ai_completions: record prompt version + prompt id
-- =============================================================================
-- Every AI completion is produced by a specific, versioned prompt module
-- (e.g. `vitalflow.ai.scribe.soap` at version `1.0.0`). Persisting both the
-- stable `prompt_id` and the `prompt_version` on the completion row makes
-- post-hoc analysis, A/B shadow-comparison, and regression-windowing tractable
-- without having to reconstruct the prompt from logs.
--
-- Both columns are nullable so historical rows (pre-scribe) remain valid, and
-- completions produced by ad-hoc code paths without a registered prompt module
-- can still be written. New scribe completions MUST set both.
--
-- See docs/ai-scribe.md §versioning (prompt versioning strategy) and
-- packages/ai/src/prompts/scribe/soap/CHANGELOG.md.
-- =============================================================================

alter table public.ai_completions
  add column if not exists prompt_id      text,
  add column if not exists prompt_version text;

create index if not exists ai_completions_prompt_idx
  on public.ai_completions (prompt_id, prompt_version)
  where prompt_id is not null;

comment on column public.ai_completions.prompt_id is
  'Stable id of the prompt module that produced this completion (e.g. vitalflow.ai.scribe.soap). Null for legacy rows.';

comment on column public.ai_completions.prompt_version is
  'Semantic version of the prompt module (e.g. 1.0.0). Paired with prompt_id for precise A/B comparison. Null for legacy rows.';
