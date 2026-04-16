export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "INTERNAL";

export class VitalFlowError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, httpStatus: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "VitalFlowError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export const unauthenticated = (msg = "Not authenticated"): VitalFlowError =>
  new VitalFlowError("UNAUTHENTICATED", msg, 401);
export const forbidden = (msg = "Forbidden"): VitalFlowError =>
  new VitalFlowError("FORBIDDEN", msg, 403);
export const notFound = (msg = "Not found"): VitalFlowError =>
  new VitalFlowError("NOT_FOUND", msg, 404);
export const validation = (msg: string, details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("VALIDATION", msg, 422, details);
export const conflict = (msg: string): VitalFlowError =>
  new VitalFlowError("CONFLICT", msg, 409);
export const rateLimited = (msg = "Rate limit exceeded"): VitalFlowError =>
  new VitalFlowError("RATE_LIMITED", msg, 429);
export const upstream = (msg: string, details?: Record<string, unknown>): VitalFlowError =>
  new VitalFlowError("UPSTREAM", msg, 502, details);
export const internal = (msg = "Internal error"): VitalFlowError =>
  new VitalFlowError("INTERNAL", msg, 500);
