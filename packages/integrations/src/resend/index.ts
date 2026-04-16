import { Resend } from "resend";

let singleton: Resend | null = null;

export function getResend(): Resend {
  if (singleton) {
    return singleton;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is required");
  }
  singleton = new Resend(key);
  return singleton;
}
