import pino from "pino";

/**
 * Structured logger used by every server-side workspace.
 *
 * PHI must never be logged. When logging patient-adjacent objects, pass them
 * through `redactPhi()` first or use `.child({ tenantId, requestId })`.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "*.password",
      "*.token",
      "*.authorization",
      "*.ssn",
      "*.dob",
      "*.mrn",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
