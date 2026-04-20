import type { TenantId, UserId } from "../tenancy/index.js";

import type {
  Appointment,
  AppointmentCancel,
  AppointmentCreate,
  AppointmentId,
  AppointmentListQuery,
  AppointmentStatusTransition,
  AppointmentUpdate,
} from "./appointment.js";
import type {
  ClinicalDocument,
  ClinicalDocumentId,
  ClinicalDocumentListQuery,
  ClinicalDocumentSign,
  ClinicalDocumentUpload,
} from "./document.js";
import type {
  DiagnosisAssignment,
  DiagnosisAssignmentCreate,
  DiagnosisAssignmentId,
  DiagnosisAssignmentUpdate,
  DiagnosisReorder,
} from "./diagnosis.js";
import type {
  Encounter,
  EncounterCreate,
  EncounterId,
  EncounterListQuery,
  EncounterUpdate,
} from "./encounter.js";
import type {
  ClinicalNote,
  ClinicalNoteDraftCreate,
  ClinicalNoteDraftUpdate,
  ClinicalNoteId,
  ClinicalNoteVersion,
  NoteAmendRequest,
  NoteSignRequest,
} from "./note.js";
import type {
  Patient,
  PatientContact,
  PatientContactCreate,
  PatientContactId,
  PatientCoverageId,
  PatientCreate,
  PatientId,
  PatientInsurance,
  PatientInsuranceCreate,
  PatientInsuranceUpdate,
  PatientListQuery,
  PatientUpdate,
} from "./patient.js";

/**
 * Service interfaces for the V1 clinical domain. These are contracts — no
 * implementations yet. Implementations land alongside Next.js Route Handlers
 * in /apps/web/src/app/api/v1/*, each calling a service backed by
 * @vitalflow/auth/server and the appropriate RLS-respecting Supabase client.
 *
 * Convention:
 *   - Every method takes the calling TenantContext's userId/tenantId
 *     explicitly so services are pure and easy to test.
 *   - Permission checks happen at the route layer (or inside the service when
 *     the decision depends on the row being operated on, e.g. sign vs. amend).
 *   - Errors are surfaced as `VitalFlowError` (see packages/shared-utils).
 */

export interface ServiceContext {
  tenantId: TenantId;
  userId: UserId;
  isImpersonating?: boolean;
}

// ---------- Patient ----------------------------------------------------------

export interface PatientService {
  create(ctx: ServiceContext, input: PatientCreate): Promise<Patient>;
  list(
    ctx: ServiceContext,
    query: PatientListQuery,
  ): Promise<{ items: Patient[]; total: number; page: number; limit: number }>;
  get(ctx: ServiceContext, id: PatientId): Promise<Patient | null>;
  update(ctx: ServiceContext, id: PatientId, input: PatientUpdate): Promise<Patient>;
  markDeceased(ctx: ServiceContext, id: PatientId, at: string): Promise<Patient>;
  softDelete(ctx: ServiceContext, id: PatientId): Promise<void>;

  // Contacts
  listContacts(ctx: ServiceContext, patientId: PatientId): Promise<PatientContact[]>;
  addContact(
    ctx: ServiceContext,
    patientId: PatientId,
    input: PatientContactCreate,
  ): Promise<PatientContact>;
  removeContact(ctx: ServiceContext, contactId: PatientContactId): Promise<void>;

  // Insurance
  listCoverages(ctx: ServiceContext, patientId: PatientId): Promise<PatientInsurance[]>;
  addCoverage(
    ctx: ServiceContext,
    patientId: PatientId,
    input: PatientInsuranceCreate,
  ): Promise<PatientInsurance>;
  updateCoverage(
    ctx: ServiceContext,
    coverageId: PatientCoverageId,
    input: PatientInsuranceUpdate,
  ): Promise<PatientInsurance>;
  removeCoverage(ctx: ServiceContext, coverageId: PatientCoverageId): Promise<void>;
}

// ---------- Appointment ------------------------------------------------------

export interface AppointmentService {
  create(ctx: ServiceContext, input: AppointmentCreate): Promise<Appointment>;
  list(ctx: ServiceContext, query: AppointmentListQuery): Promise<Appointment[]>;
  get(ctx: ServiceContext, id: AppointmentId): Promise<Appointment | null>;
  update(ctx: ServiceContext, id: AppointmentId, input: AppointmentUpdate): Promise<Appointment>;
  setStatus(
    ctx: ServiceContext,
    id: AppointmentId,
    input: AppointmentStatusTransition,
  ): Promise<Appointment>;
  cancel(ctx: ServiceContext, id: AppointmentId, input: AppointmentCancel): Promise<Appointment>;
  /** Creates an encounter (if none) and links it back. Returns the encounter id. */
  openEncounter(ctx: ServiceContext, id: AppointmentId): Promise<{ encounterId: EncounterId }>;
}

// ---------- Encounter --------------------------------------------------------

export interface EncounterService {
  create(ctx: ServiceContext, input: EncounterCreate): Promise<Encounter>;
  list(ctx: ServiceContext, query: EncounterListQuery): Promise<Encounter[]>;
  get(ctx: ServiceContext, id: EncounterId): Promise<Encounter | null>;
  update(ctx: ServiceContext, id: EncounterId, input: EncounterUpdate): Promise<Encounter>;
  /** Finishes the encounter. Fails if the active note is not signed. */
  finish(ctx: ServiceContext, id: EncounterId): Promise<Encounter>;
}

// ---------- ClinicalNote -----------------------------------------------------

export interface ClinicalNoteService {
  /** Returns the latest non-amended note for an encounter, or null. */
  getCurrent(ctx: ServiceContext, encounterId: EncounterId): Promise<ClinicalNote | null>;

  /** Returns every version (including amended) ordered by version desc. */
  getHistory(ctx: ServiceContext, encounterId: EncounterId): Promise<ClinicalNoteVersion[]>;

  createDraft(ctx: ServiceContext, input: ClinicalNoteDraftCreate): Promise<ClinicalNote>;

  /** Upsert draft content. Honors optimistic-lock header. */
  saveDraft(
    ctx: ServiceContext,
    noteId: ClinicalNoteId,
    input: ClinicalNoteDraftUpdate,
  ): Promise<ClinicalNote>;

  /** Flips draft → signed + inserts public.signatures row in a transaction. */
  sign(ctx: ServiceContext, noteId: ClinicalNoteId, input: NoteSignRequest): Promise<ClinicalNote>;

  /**
   * Creates a new draft carrying prior content, flips old row to 'amended'.
   * Emits the audit event note.amended with the reason.
   */
  amend(
    ctx: ServiceContext,
    noteId: ClinicalNoteId,
    input: NoteAmendRequest,
  ): Promise<ClinicalNote>;
}

// ---------- DiagnosisAssignment ---------------------------------------------

export interface DiagnosisService {
  list(ctx: ServiceContext, encounterId: EncounterId): Promise<DiagnosisAssignment[]>;
  assign(
    ctx: ServiceContext,
    encounterId: EncounterId,
    input: DiagnosisAssignmentCreate,
  ): Promise<DiagnosisAssignment>;
  update(
    ctx: ServiceContext,
    id: DiagnosisAssignmentId,
    input: DiagnosisAssignmentUpdate,
  ): Promise<DiagnosisAssignment>;
  remove(ctx: ServiceContext, id: DiagnosisAssignmentId): Promise<void>;
  reorder(
    ctx: ServiceContext,
    encounterId: EncounterId,
    input: DiagnosisReorder,
  ): Promise<DiagnosisAssignment[]>;
  /** Optional: promote an encounter diagnosis to the patient problem list. */
  promoteToProblem(
    ctx: ServiceContext,
    id: DiagnosisAssignmentId,
  ): Promise<{ problemId: string }>;
}

// ---------- ClinicalDocument -------------------------------------------------

export interface ClinicalDocumentService {
  list(ctx: ServiceContext, query: ClinicalDocumentListQuery): Promise<ClinicalDocument[]>;
  get(ctx: ServiceContext, id: ClinicalDocumentId): Promise<ClinicalDocument | null>;
  /**
   * Two-step upload:
   *   1. `requestUpload` returns a presigned URL + the pending row id.
   *   2. Client PUTs the file to the URL.
   *   3. `finalizeUpload` verifies sha256 and flips the row to uploaded state.
   */
  requestUpload(
    ctx: ServiceContext,
    input: ClinicalDocumentUpload,
  ): Promise<{ documentId: ClinicalDocumentId; uploadUrl: string; expiresAt: string }>;
  finalizeUpload(
    ctx: ServiceContext,
    id: ClinicalDocumentId,
    input: { sha256: string },
  ): Promise<ClinicalDocument>;
  sign(
    ctx: ServiceContext,
    id: ClinicalDocumentId,
    input: ClinicalDocumentSign,
  ): Promise<ClinicalDocument>;
  /** Returns a short-lived signed URL for the document contents. */
  downloadUrl(
    ctx: ServiceContext,
    id: ClinicalDocumentId,
  ): Promise<{ url: string; expiresAt: string }>;
  remove(ctx: ServiceContext, id: ClinicalDocumentId): Promise<void>;
}

// ---------- Bundle -----------------------------------------------------------

/**
 * Aggregate handle so API routes can depend on a single type. Each concrete
 * service is instantiated with the Supabase server client in the composition
 * root; routes call `services.patients.create(...)` etc.
 */
export interface ClinicalServices {
  patients: PatientService;
  appointments: AppointmentService;
  encounters: EncounterService;
  notes: ClinicalNoteService;
  diagnoses: DiagnosisService;
  documents: ClinicalDocumentService;
}
