/**
 * PHI redaction helpers.
 *
 * These are belt-and-suspenders; the logger already redacts common PHI paths.
 * Use `redactPhi()` before sending objects to AI models, analytics, or any
 * third-party surface where PHI must not leak.
 */

const PHI_KEYS = new Set([
  "ssn",
  "dob",
  "dateOfBirth",
  "mrn",
  "medicalRecordNumber",
  "insuranceId",
  "policyNumber",
  "email",
  "phone",
  "address",
  "givenName",
  "familyName",
  "fullName",
]);

export function redactPhi<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactPhi(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = PHI_KEYS.has(k) ? "[REDACTED]" : redactPhi(v);
  }
  return out as T;
}
