/**
 * Canonical error taxonomy for VitalFlow. Every service throws
 * `VitalFlowError` with a code from this union; every action + route adapter
 * maps those codes to HTTP status / banner text.
 *
 * Keep this file tiny — no deps. It's the one type every package imports.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "BAD_STATE"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "INTEGRATION_NOT_CONFIGURED"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  BAD_STATE: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTEGRATION_NOT_CONFIGURED: 501,
  INTERNAL: 500,
};

/** Short human-friendly label for each code; used as fallback banner copy. */
const DEFAULT_LABEL: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Sign-in required",
  FORBIDDEN: "You don't have permission to do that",
  NOT_FOUND: "Not found",
  VALIDATION: "Input is invalid",
  CONFLICT: "That conflicts with something else",
  BAD_STATE: "Action not allowed in the current state",
  RATE_LIMITED: "Too many requests — slow down",
  UPSTREAM: "Upstream service failed",
  INTEGRATION_NOT_CONFIGURED: "This integration isn't configured yet",
  INTERNAL: "Something went wrong",
};

export class VitalFlowError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number = HTTP_STATUS[code],
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VitalFlowError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------- Factories -------------------------------------------------------
// All factories RETURN an error. Callers `throw` it. This keeps call sites
// explicit — we never hide throws behind helper function calls.

export const unauthenticated = (msg = "Not authenticated"): VitalFlowError =>
  new VitalFlowError("UNAUTHENTICATED", msg);

export const forbidden = (msg = "Forbidden", details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("FORBIDDEN", msg, HTTP_STATUS.FORBIDDEN, details);

export const notFound = (msg = "Not found"): VitalFlowError => new VitalFlowError("NOT_FOUND", msg);

export const validation = (msg: string, details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("VALIDATION", msg, HTTP_STATUS.VALIDATION, details);

export const conflict = (msg: string, details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("CONFLICT", msg, HTTP_STATUS.CONFLICT, details);

export const badState = (msg: string, details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("BAD_STATE", msg, HTTP_STATUS.BAD_STATE, details);

export const rateLimited = (msg = "Rate limit exceeded"): VitalFlowError =>
  new VitalFlowError("RATE_LIMITED", msg);

export const upstream = (msg: string, details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("UPSTREAM", msg, HTTP_STATUS.UPSTREAM, details);

export const integrationNotConfigured = (
  integration: string,
  details?: Record<string, unknown>,
): VitalFlowError =>
  new VitalFlowError(
    "INTEGRATION_NOT_CONFIGURED",
    `${integration} is not configured`,
    HTTP_STATUS.INTEGRATION_NOT_CONFIGURED,
    details,
  );

export const internal = (msg = "Internal error"): VitalFlowError =>
  new VitalFlowError("INTERNAL", msg);

// ---------- Action adapters -------------------------------------------------

/**
 * Turn any thrown value into a single-line banner string suitable for the
 * workspace `?error=` query parameter. Never leaks stack traces.
 *
 * Prefer the `VitalFlowError.message` when present; fall back to the code's
 * default label; last resort is a generic "Something went wrong".
 */
export function toBannerMessage(err: unknown): string {
  if (err instanceof VitalFlowError) {
    return err.message || DEFAULT_LABEL[err.code];
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return DEFAULT_LABEL.INTERNAL;
}

/**
 * HTTP status derived from any thrown value — for REST route adapters that
 * forward a `VitalFlowError`. Non-VitalFlow errors default to 500.
 */
export function toHttpStatus(err: unknown): number {
  if (err instanceof VitalFlowError) return err.httpStatus;
  return HTTP_STATUS.INTERNAL;
}

/**
 * Re-throw helper that preserves type narrowing. Use inside a `catch` when
 * you need to log + rethrow with the structured type intact.
 */
export function assertVitalFlowError(err: unknown): asserts err is VitalFlowError {
  if (!(err instanceof VitalFlowError)) {
    throw new VitalFlowError("INTERNAL", err instanceof Error ? err.message : String(err));
  }
}
