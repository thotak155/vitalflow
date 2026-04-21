# SOAP draft prompt — changelog

All versions live as immutable sibling files (`v1.0.0.ts`, `v1.1.0.ts`, ...). A published version is
never edited; regressions are handled by cutting a new version and flipping the registry selector.

Version id format: `vitalflow.ai.scribe.soap.v<MAJOR>.<MINOR>.<PATCH>`.

- **MAJOR** — output-shape changes (schema breaking). Requires consumer update.
- **MINOR** — behavioral changes affecting content quality (new rules, section conventions,
  confidence calibration). Shadow-mode rollout required.
- **PATCH** — wording, formatting, typo fixes. Direct rollout.

---

## v1.0.0 — 2026-04-20

**Category:** MAJOR (initial release).

**Author:** @kiranthota (design), Claude Opus 4.7 (drafting).

**Rationale:** First production SOAP prompt for the AI scribe. Establishes:

- Seven-tag `warnings[]` vocabulary
  (`Contradiction|Missing|Unclear|Conflict|Off-context|Judgment|Redacted`).
- Flat per-section `confidence: number` in the model output contract. Server lifts to
  `{model_self, grounding, combined}` before persisting into `ai_completions.structured_output`.
- Section-level `segmentIds[]` trace refs. Server-side validation drops any id that does not belong
  to the session and appends an `Off-context` warning.
- Two output modes: `json` (structured, parsed via `SoapModelOutputSchema`) and `markdown`
  (clinician preview, not machine-parsed).
- No auto-sign. No treatment suggestions not stated by the clinician. No diagnostic labels not given
  by the clinician.

**Metrics baseline:** none yet — this is the initial rollout. First 200 paired production
completions establish the baseline against which future MINOR bumps will be shadow-tested.

**Known limits (punted to later versions):**

- No fine-grained trace refs at character offsets inside a segment — section level only.
- No speaker-diarization-aware prompting — `speaker` attribute is passed if present, but the model
  is not given explicit diarization rules.
- No specialty tuning — one prompt covers primary care, urgent care, and specialty visits uniformly.
