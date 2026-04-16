"use client";

import * as React from "react";

import { LoadingState } from "../patterns/loading-state.js";

export interface AuthGuardUser {
  id: string;
  /** Permissions granted to this user across the active tenant. */
  permissions: readonly string[];
}

export interface AuthGuardProps {
  /**
   * Current user resolution. `undefined` means "still resolving"; `null` means
   * "definitely unauthenticated". Supplied by the host app — this component
   * does not call Supabase directly so the UI package stays framework-free.
   */
  user: AuthGuardUser | null | undefined;
  /** All permissions in this list must be present on the user. */
  requires?: readonly string[];
  /** Rendered while `user` is `undefined`. */
  loadingFallback?: React.ReactNode;
  /** Rendered when unauthenticated. Typically a redirect effect in the host. */
  unauthenticatedFallback?: React.ReactNode;
  /** Rendered when authenticated but lacking required permissions. */
  forbiddenFallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Placeholder client-side guard. Gates rendering based on a user object that
 * the host app resolves (via @vitalflow/auth). Does NOT replace RLS — treat
 * this as UX, not a security boundary.
 */
export function AuthGuard({
  user,
  requires = [],
  loadingFallback = <LoadingState />,
  unauthenticatedFallback = null,
  forbiddenFallback = null,
  children,
}: AuthGuardProps) {
  if (user === undefined) {
    return <>{loadingFallback}</>;
  }
  if (user === null) {
    return <>{unauthenticatedFallback}</>;
  }
  const granted = new Set(user.permissions);
  const ok = requires.every((r) => granted.has(r));
  if (!ok) {
    return <>{forbiddenFallback}</>;
  }
  return <>{children}</>;
}
