import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random 32-byte token (64 hex chars). The raw
 * token is handed to the invitee via URL; only `hashToken(token)` is stored
 * in `public.invitations.token_hash`. Lookup is done by hash — the plaintext
 * never hits the database.
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex digest of the token string. Deterministic. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
