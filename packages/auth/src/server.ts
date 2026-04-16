import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@vitalflow/types";

export type SupabaseServerClient = ReturnType<typeof createServerClient<Database>>;

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Server-side Supabase client bound to the active Next.js request cookies.
 * Use from Route Handlers, Server Actions, and Server Components.
 */
export async function createVitalFlowServerClient(): Promise<SupabaseServerClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (all: CookieToSet[]) => {
        for (const { name, value, options } of all) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
