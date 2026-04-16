import type { ReactNode } from "react";

/**
 * Public/unauthenticated surfaces: sign-in, sign-up, accept-invite, password
 * reset. Minimal chrome, single-column, no sidebar or topnav.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
