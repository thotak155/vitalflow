import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@vitalflow/types";

export type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

/**
 * Browser-side Supabase client. Call from client components only.
 * Reads the public URL and anon key from NEXT_PUBLIC_* env.
 */
export function createVitalFlowBrowserClient(): SupabaseBrowserClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient<Database>(url, key);
}
