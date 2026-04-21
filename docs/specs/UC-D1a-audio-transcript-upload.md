# UC-D1a — Provider uploads audio for transcription

> **Status:** Draft · **Group:** D (AI augmentation) · **Priority:** v1.1 (not demo-critical; the
> transcript-paste path in UC-D1 already ships the end-to-end narrative).

## Actors

- _Primary:_ Physician (role `physician`; holds `ai:invoke`).
- _Secondary:_ Nurse / MA (role `nurse_ma`; holds `ai:invoke`, can create audio sessions but cannot
  sign resulting notes).

## Preconditions

- Caller is signed in and holds `ai:invoke` for the encounter's tenant.
- The target encounter exists and is not soft-deleted; tenant BAA is signed (clinical writes are
  blocked otherwise via `require_baa_signed()`).
- No active (`status` not in `cancelled`/`rejected`/`failed`) `ai_scribe_sessions` row already
  exists for the encounter. The partial index `ai_scribe_sessions_tenant_enc_idx` covers this
  lookup.
- Supabase Storage bucket `scribe-raw` exists (provisioned 2026-04-20 per
  `memory/project_scribe_bucket.md`). 90-day auto-delete via `pg_cron` is pending — see Open
  Questions.

## Trigger

On `/encounters/[id]`, the provider clicks **Upload audio** (or **Record from mic**) in the AI
scribe intake panel — today this is the `AIReviewIntakePanel` component at
`apps/web/src/app/(app)/encounters/[id]/ai-review/AIReviewIntakePanel.tsx`. The existing button is
disabled with the comment "Audio pipeline wires up in the orchestrator PR"; this UC lights it up.

## Main Flow

1. Provider clicks **Upload audio** (file picker opens) or **Record** (browser `MediaRecorder` with
   visible timer, pause, stop). Accepted MIME types: `audio/webm`, `audio/ogg`, `audio/mp4`,
   `audio/wav`, `audio/mpeg`. Max file size: 100 MB (≈ 90-minute visit at 128 kbps) — enforced
   client-side and via bucket policy (NEW — proposed).
2. Client calls `POST /api/v1/ai/scribe/sessions` (existing stub at
   `apps/web/src/app/api/v1/ai/scribe/sessions/route.ts`) with body
   `{ encounterId, source: "audio_upload" }`. Route-handler path re-asserts `ai:invoke`, validates
   input via `CreateScribeSessionInputSchema` from `@vitalflow/types`, and delegates to
   `ScribeSessionService.create` (contract in `packages/ai/src/scribe/services.ts`).
3. Service inserts a row into `public.ai_scribe_sessions` with `tenant_id`, `encounter_id`,
   `patient_id`, `created_by = session.userId`, `source = 'audio_upload'`, `status = 'pending'`, and
   computes a deterministic `audio_storage_path` (e.g. `scribe-raw/<tenant_id>/<session_id>.webm`).
   Returns `{ sessionId, signedUploadUrl, storagePath, expiresAt }`.
4. Client PUTs the audio file to the signed upload URL (Supabase Storage REST). On success the
   client calls `POST /api/v1/ai/scribe/sessions/[id]/transcript` with `{ storagePath }`. Handler
   re-asserts `ai:invoke`, validates via `SubmitTranscriptInputSchema`, delegates to
   `ScribeSessionService.submitTranscript`.
5. Service flips `ai_scribe_sessions.status` to `transcribing`, inserts the first of three
   `public.ai_requests` rows (`request_type='scribe_transcribe'`, `correlation_id = sessionId`,
   `status='running'`), and invokes
   `TranscriptionService.transcribeAudio({ sessionId, storagePath })`. Implementation uses Gemini
   2.0 Flash multimodal (per `docs/ai-scribe.md §2`).
6. On each returned transcript segment, the service inserts rows into
   `public.ai_scribe_transcript_segments` (`session_id`, `sequence_index`, `start_ms`, `end_ms`,
   `speaker`, `text`, `partial=false`). The session moves through
   `transcribing → generating → suggesting_codes → awaiting_review` (enum
   `ai_scribe_session_status`). `ai_scribe_sessions.transcribe_request_id` / `generate_request_id` /
   `suggest_request_id` are populated as each step completes; `total_cost_micros_usd` and
   `total_latency_ms` accumulate.
7. UI polls `GET /api/v1/ai/scribe/sessions/[id]` (route already stubbed) every ~2s while status ∈
   {pending, transcribing, generating, suggesting_codes}. When status becomes `awaiting_review`, the
   `AIReviewProgressPanel` flips to the `AIReviewPanel` state and shows the draft + code suggestions
   exactly like the paste path. From here, UC-D1 (accept draft) governs the rest.

## Alternate Flows

### A1. File-too-large / wrong MIME

1. At step 1, user selects a 200 MB WAV or a `.mp3` that is larger than the 100 MB cap, or a `.txt`
   that is not an audio type.
2. Client rejects before the upload — no session row is created. Status message "Audio must be ≤ 100
   MB and in webm/ogg/mp4/wav/mpeg format."

### A2. Upload interrupted

1. At step 4, the PUT to storage fails (network, tab closed).
2. The `ai_scribe_sessions` row is in `status='pending'` with `audio_storage_path` pointing at a
   non-existent object.
3. A cleanup job (NEW — proposed; pg_cron or Edge cron) looks for `ai_scribe_sessions` in `pending`
   older than 30 min and flips them to `cancelled` with `error_message='Upload never completed'`. UI
   lets the user cancel manually via `POST /api/v1/ai/scribe/sessions/[id]/cancel` (existing stub).

### A3. Transcription step fails

1. At step 6, `TranscriptionService.transcribeAudio` throws (provider 5xx, quota exceeded, malformed
   audio).
2. `ai_requests.status = 'failed'`; `ai_scribe_sessions.status = 'failed'` with `error_message` set;
   `transcribe_request_id` is still populated for forensics.
3. UI surfaces a retry affordance ("Transcription failed — retry, or switch to paste-transcript
   mode"). Retry re-invokes the step; paste-mode inserts the transcript segments directly (chunking
   via `TranscriptionService.chunkText`) and skips transcription.

### A4. Audio is silent / too short

1. Transcription returns zero segments.
2. `ai_scribe_sessions.status = 'failed'`, `error_message = 'No speech detected'`. No downstream
   steps run. User can retry with a different file.

### A5. Session cancelled mid-pipeline

1. At any point during steps 5–6, user clicks **Cancel**.
2. `POST /api/v1/ai/scribe/sessions/[id]/cancel` → `ScribeSessionService.cancel` flips
   `status='cancelled'`. In-flight `ai_requests` are best-effort abandoned (no hard-kill of provider
   calls) — their `status` becomes `cancelled` on their next heartbeat. Segments already inserted
   remain for forensics but are not displayed.

### A6. Audio asset retention (90-day TTL)

1. `scribe-raw` bucket is configured with a 90-day retention policy. A nightly job (NEW — proposed;
   `pg_cron` per memory/project_scribe_bucket.md) deletes objects older than 90 days and sets
   `ai_scribe_sessions.audio_storage_path = NULL` for the matching rows. The transcript + segments +
   generated note remain — only the raw audio is purged.

## Postconditions

- Success: `ai_scribe_sessions.status = 'awaiting_review'`, all three `ai_requests` rows in
  `status='succeeded'`, `ai_scribe_transcript_segments` populated, `ai_scribe_code_suggestions`
  populated. UI shows draft + codes.
- Final acceptance inserts into `public.encounter_notes` (`ai_assisted=true`,
  `ai_request_id=<generate_request_id>`) via UC-D1 — NOT this UC.
- Every state change in `ai_scribe_sessions` emits an audit event via `ai_scribe_sessions_audit`
  trigger. Segments and code suggestions have their own triggers.
- Raw audio remains in `scribe-raw` until the 90-day TTL purges it.

## Business Rules

- **BR-1.** Tenant isolation — every insert sets `tenant_id = session.tenantId`. RLS on
  `ai_scribe_sessions` / `ai_scribe_transcript_segments` / `ai_scribe_code_suggestions` requires
  `has_permission('ai:invoke', tenant_id)`.
- **BR-2.** PHI minimization at prompt time — per `docs/ai-scribe.md`, the `SafetyGuardrails`
  package redacts PHI before the prompt leaves the app. Audio itself is uploaded raw (it is PHI),
  but it is stored in a tenant-isolated bucket with retention.
- **BR-3.** Nothing signs a note automatically. The pipeline ends at `awaiting_review`. Acceptance →
  draft `encounter_notes` row; signing is a separate `clinical:sign` action.
- **BR-4.** Impersonators cannot use this flow to cause clinical writes — `ai:invoke` is NOT in
  `IMPERSONATION_BLOCKED`, but the downstream accept-draft action writes to `encounter_notes` which
  requires `clinical:write` which IS impersonation-blocked. Net: a support engineer impersonating a
  physician can start a session and watch it run, but cannot accept it into the chart.
- **BR-5.** Retention — raw audio lives at most 90 days in `scribe-raw`. Transcripts and drafts are
  permanent clinical records (subject to normal retention policy).
- **BR-6.** Concurrency — at most one non-terminal session per encounter. Enforced by
  `ScribeSessionService.create` doing a pre-insert lookup (index `ai_scribe_sessions_tenant_enc_idx`
  makes this cheap).

## Exceptions

| Code                       | When it happens                                                        | User-facing message                                                 |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `E_PERMISSION`             | Caller lacks `ai:invoke`                                               | "You don't have access to do this."                                 |
| `E_VALIDATION`             | Bad MIME, oversize file, missing `encounterId`                         | Field-level error / "Audio must be ≤ 100 MB…"                       |
| `E_CONFLICT`               | Active session already exists for this encounter                       | "A scribe session is already running — resume or cancel it first."  |
| `E_UPLOAD_FAILED`          | Signed-URL PUT returned non-2xx                                        | "Upload failed — retry. If it keeps failing, use paste-transcript." |
| `E_TRANSCRIPTION_FAILED`   | Provider error / silent audio                                          | "Transcription failed — retry, or switch to paste-transcript mode." |
| `E_STORAGE_OBJECT_MISSING` | `submitTranscript` called with `storagePath` that is not in the bucket | "Upload never completed — please re-upload."                        |

## Data Model Touchpoints

| Table                                  | Writes                                                                                                                                                                                                                                                                                                   | Reads                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `public.ai_scribe_sessions`            | INSERT `tenant_id`, `encounter_id`, `patient_id`, `created_by`, `source='audio_upload'`, `status='pending'`, `audio_storage_path`; UPDATE `status`, `transcribe_request_id`, `generate_request_id`, `suggest_request_id`, `total_cost_micros_usd`, `total_latency_ms`, `error_message`, `metadata`       | SELECT for pre-insert conflict check (`status not in ('cancelled','rejected','failed')`) |
| `public.ai_scribe_transcript_segments` | INSERT (N rows) `tenant_id`, `session_id`, `sequence_index`, `start_ms`, `end_ms`, `speaker`, `text`, `partial=false`                                                                                                                                                                                    | SELECT by `session_id` for UI render                                                     |
| `public.ai_scribe_code_suggestions`    | INSERT (N rows) `tenant_id`, `session_id`, `encounter_id`, `type`, `code_system`, `code`, `description`, `confidence`, `rank`, `segment_ids`                                                                                                                                                             | SELECT by `session_id` for UI render                                                     |
| `public.ai_requests`                   | INSERT 3 rows (transcribe / generate / suggest); UPDATE `status`, `tokens_in`, `tokens_out`, `cost_micros_usd`, `latency_ms`, `completed_at` as each step resolves. Disallowed by RLS for regular users (`revoke update, delete` in migration 0008) — requires service-role write from the orchestrator. | SELECT by `correlation_id = session_id`                                                  |
| `public.encounters`                    | —                                                                                                                                                                                                                                                                                                        | SELECT `patient_id`, `deleted_at IS NULL`, tenant scope                                  |
| Storage bucket `scribe-raw`            | PUT `<tenant_id>/<session_id>.<ext>` via signed URL (client-side)                                                                                                                                                                                                                                        | 90-day retention sweep (NEW — proposed)                                                  |
| `audit.audit_events`                   | (Triggers) INSERT/UPDATE on `ai_scribe_sessions`, `ai_scribe_transcript_segments`, `ai_scribe_code_suggestions`                                                                                                                                                                                          | —                                                                                        |

## Permissions Required

| Permission       | Enforced where                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai:invoke`      | Route handlers `POST /api/v1/ai/scribe/sessions`, `POST /api/v1/ai/scribe/sessions/[id]/transcript`, `POST /…/cancel`; RLS on all three `ai_scribe_*` tables |
| `clinical:read`  | Page guard on `/encounters/[id]` that hosts the panel                                                                                                        |
| `clinical:write` | Downstream on UC-D1 accept (not this UC) — the session author does NOT need `clinical:write` to run the pipeline; only acceptance writes `encounter_notes`   |

`ai:invoke` is granted to `practice_owner`, `physician`, `nurse_ma`. Not granted to `biller`,
`scheduler`, `office_admin`.

## UX Surface

- **Route:** `/encounters/[id]` (existing) — intake panel lives in the AI scribe card.
- **Component:** existing `AIReviewIntakePanel` (the "Upload audio" half). NEW — proposed
  `AudioRecorder` subcomponent for the record-from-mic path.
- **API endpoints (existing stubs to be implemented):**
  - `POST /api/v1/ai/scribe/sessions` — create session + return signed upload URL.
  - `POST /api/v1/ai/scribe/sessions/[id]/transcript` — kick off pipeline with `{ storagePath }`.
  - `GET /api/v1/ai/scribe/sessions/[id]` — session view (for polling).
  - `POST /api/v1/ai/scribe/sessions/[id]/cancel` — cancel.
- **Audit events:** row-level triggers cover state changes. Per `docs/ai-scribe.md`, semantic events
  `ai.draft_generated` (on `awaiting_review`) and `ai.draft_accepted`/`ai.draft_rejected` (in UC-D1)
  are emitted via `logEvent`. Add `ai.audio_upload_started` (NEW — proposed) when the session is
  created with `source='audio_upload'`.

## Test Plan

- **Happy path
  (`uc-d1a-audio-transcript-upload.spec.ts › should run audio pipeline end to end and reach awaiting_review`):**
  sign in as physician, open encounter, upload a 30-second sample `.webm`, assert status transitions
  `pending → transcribing → generating → suggesting_codes → awaiting_review`, assert transcript
  segments and draft render.
- **Alt path — retry after transcription failure
  (`uc-d1a-audio-transcript-upload.spec.ts › should allow retry on transcription failure`):** stub
  the provider to fail once, assert status `failed` with retry button, click retry, assert success.
- **Alt path — fall back to paste
  (`uc-d1a-audio-transcript-upload.spec.ts › should switch to paste-transcript after failure`):**
  after a failed audio run, click "Switch to paste", paste text, assert pipeline completes.
- **Alt path — cancel mid-pipeline
  (`uc-d1a-audio-transcript-upload.spec.ts › should cancel a running session`):** start a long
  audio, click Cancel, assert `status = cancelled` in the session row.
- **Negative — oversize file
  (`uc-d1a-audio-transcript-upload.spec.ts › should reject files over 100 MB client-side`):** pick a
  150 MB audio file, assert error toast and no session row is created.
- **Negative — permission denied
  (`uc-d1a-audio-transcript-upload.spec.ts › should 403 when scheduler POSTs to create session`):**
  sign in as `scheduler`, POST to the sessions endpoint, assert 403.
- **Negative — existing session conflict
  (`uc-d1a-audio-transcript-upload.spec.ts › should 409 when an active session exists`):** seed an
  `ai_scribe_sessions` row in status `awaiting_review`, POST create, assert 409.

## Open Questions

- **OQ-1. 90-day TTL enforcement.** `memory/project_scribe_bucket.md` flags the TTL as "not yet
  wired (pg_cron deferred until pipeline goes live)". This UC assumes the sweep exists. Decide: (a)
  land the pg_cron job in the same PR as the audio pipeline, (b) rely on a manual Supabase CLI
  script until V1.2, (c) use Storage lifecycle policy directly. Recommend (a) — the memory says
  deferral is until pipeline ships, and this UC is that ship date.
- **OQ-2. Record-from-mic vs upload-only.** The existing UI only references "Upload audio". Browser
  `MediaRecorder` support varies (iOS Safari: `.mp4`, Chrome: `.webm`). Is record-from-mic in-scope
  for V1.1 or strictly upload? If record-from-mic, specify the fallback when the browser blocks
  microphone permission.
- **OQ-3. Transcription provider.** `docs/ai-scribe.md §2` says Gemini 2.0 Flash. Confirm: (a)
  Gemini Flash for transcription in V1.1, or (b) a dedicated STT provider (Deepgram, AssemblyAI) for
  better diarization. This UC is agnostic but `TranscriptionService.transcribeAudio` implementation
  depends on the decision.
- **OQ-4. Streaming partial transcript.** `ai_scribe_transcript_segments.partial` column exists
  (default false). Do we write streaming-partial segments as they arrive from the provider and flip
  them to `partial=false` at step end, or only persist final segments? Partial streaming gives a
  better UX but doubles the write volume.
- **OQ-5. Storage path layout.** Proposed: `<tenant_id>/<session_id>.<ext>`. Alternative with better
  forensic locality: `<tenant_id>/<yyyy>/<mm>/<session_id>.<ext>`. Doesn't affect correctness — pick
  before rollout so retention globs match.
- **OQ-6. Vercel timeout ceiling.** `docs/ai-scribe.md §3.3` notes the inline-orchestrator strategy
  fits within Vercel's 60s function timeout for typical audio. Audio > 10 min may exceed this. Do we
  (a) reject audio longer than N minutes in V1.1, or (b) move orchestration to Supabase Edge
  Functions from day one?
