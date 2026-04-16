"use client";

import Link from "next/link";

import { SURFACE_HOMES, SURFACE_LABELS, type Surface } from "../lib/roles.js";

export interface SurfaceSwitcherProps {
  active: Surface;
  available: readonly Surface[];
}

/**
 * Pill-group shown in the top-nav for users who carry multiple roles. Single-
 * surface users don't see it. Each pill is a plain link to that surface's
 * home path — the shell re-derives the active surface from the URL.
 */
export function SurfaceSwitcher({ active, available }: SurfaceSwitcherProps) {
  if (available.length <= 1) {
    return null;
  }
  return (
    <div
      role="group"
      aria-label="Switch workspace"
      className="flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5"
    >
      {available.map((surface) => {
        const isActive = surface === active;
        return (
          <Link
            key={surface}
            href={SURFACE_HOMES[surface]}
            aria-current={isActive ? "page" : undefined}
            className={
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors " +
              (isActive
                ? "bg-background text-foreground shadow-vf-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {SURFACE_LABELS[surface]}
          </Link>
        );
      })}
    </div>
  );
}
