import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@vitalflow/types";

export type SupabaseAdminClient = SupabaseClient<Database>;

/**
 * Service-role Supabase client. Bypasses RLS — use only from trusted
 * server code (Server Actions, Route Handlers, server-side tasks) that
 * has already performed its own authorization check.
 *
 * Never call this from a Client Component or pass the returned client
 * anywhere the browser can observe.
 */
export function createVitalFlowAdminClient(): SupabaseAdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
