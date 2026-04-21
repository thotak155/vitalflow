# Code-suggestions prompt — changelog

All versions live as immutable sibling files (`v1.0.0.ts`, `v1.1.0.ts`, ...). A published version is
never edited; regressions are handled by cutting a new version and flipping the registry selector.

Version id format: `vitalflow.ai.scribe.code_suggestions.v<MAJOR>.<MINOR>.<PATCH>`.

- **MAJOR** — output-shape changes (schema breaking). Requires consumer update.
- **MINOR** — behavioral changes affecting suggestion quality (new tag, confidence-band
  recalibration, overcoding heuristic changes, rationale format changes). Shadow-mode rollout
  required.
- **PATCH** — wording, formatting, typo fixes. Direct rollout.

---

## v1.0.0 — 2026-04-20

**Category:** MAJOR (initial release).

**Author:** @kiranthota (design), Claude Opus 4.7 (drafting).

**Rationale:** First production code-suggestion prompt for the AI scribe. Establishes:

- Eight-tag `warnings[]` vocabulary
  (`Contradiction | Missing | Unclear | Conflict | Off-context | Unsupported | Overcoding | Redacted`).
  Shares the first six with the SOAP prompt; adds `Unsupported` (concept mentioned but
  under-documented) and `Overcoding` (a more-aggressive code declined — a transparency signal to
  reviewers).
- Required per-suggestion `rationale`, `missingDocumentation[]`, and `source`
  (`transcript | soap_only | patient_context`). Persisted to `ai_scribe_code_suggestions` via
  migration `20260420000004_code_suggestions_richer.sql`.
- Flat per-suggestion `confidence: number` in the model output contract. Server lifts to
  `{model_self, grounding, combined}` using a multi-factor support score: transcript cited-token
  overlap (α=0.5), SOAP/context presence (β=0.3), specificity penalty derived from
  `missingDocumentation` length (γ=0.2).
- Section-level `segmentIds[]` trace refs with server-side integrity check. Hallucinated ids are
  dropped and an `Off-context` warning is appended.
- Anti-overcoding heuristics baked into the system prompt: specificity floor, no symptom+diagnosis
  double-coding, no deferred-procedure coding, conservative E/M level selection with documentation
  gap called out.
- E/M (99202–99215) `model_self` capped at 0.7 at the service layer until MDM/time/complexity are
  clearly documented — E/M is the highest-risk overcoding category in ambulatory care, prompt is
  deliberately biased toward underconfidence.
- Model-agnostic prompt (JSON schema embedded in user prompt). Service resolves model via
  `AI_SCRIBE_CODES_MODEL` env var (default `gemini-2.0-flash`) with per-session `modelOverride`
  accepted.

**Metrics baseline:** none yet — initial rollout. First 200 paired production completions establish
the baseline against which MINOR bumps will be shadow-tested. Metrics to track:

- mean `confidence.combined` per suggestion
- mean `missingDocumentation.length`
- mean `warnings[].length`
- **acceptance rate** (accepted_at populated / total suggested)
- **overcoding false-positive rate** (accepted, then edited down or removed by reviewer)

**Known limits (punted to later versions):**

- No modifier codes (-25, -59, etc.) — V2.
- No bundling logic (NCCI edits, mutually-exclusive pairs).
- No specialty-specific tuning — one prompt covers primary care, urgent care, and specialties
  uniformly.
- No HCPCS Level II or revenue codes.
- No temporal linking across visits (problem-list → current-visit diagnosis matching is shallow).
