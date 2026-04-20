// V1 clinical domain — see docs/clinical-domain.md.
//
// Entities:
//   - Patient, PatientContact, PatientInsurance, Payer   (patient.ts)
//   - Appointment                                        (appointment.ts)
//   - Encounter                                          (encounter.ts)
//   - ClinicalNote, ClinicalNoteVersion                  (note.ts)
//   - DiagnosisAssignment                                (diagnosis.ts — requires new table)
//   - ClinicalDocument                                   (document.ts — extends attachments)
//   - Service interfaces                                 (services.ts)

export * from "./patient.js";
export * from "./appointment.js";
export * from "./encounter.js";
export * from "./note.js";
export * from "./diagnosis.js";
export * from "./document.js";
export * from "./services.js";
