// HL7v2 MLLP adapter stub. Real implementation should live behind a queue
// (workflow-service) and never be called directly from Next.js request paths.
export interface Hl7Message {
  readonly raw: string;
  readonly messageType: string;
  readonly controlId: string;
}

export function parseHl7(raw: string): Hl7Message {
  const segments = raw.split(/\r|\n/).filter(Boolean);
  const msh = segments[0] ?? "";
  const fields = msh.split("|");
  return {
    raw,
    messageType: fields[8] ?? "UNKNOWN",
    controlId: fields[9] ?? "UNKNOWN",
  };
}
