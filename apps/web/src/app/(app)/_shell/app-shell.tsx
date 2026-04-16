"use client";

import { HeartPulse, Shield, UserRound } from "@vitalflow/ui/icons";
import {
  Sidebar,
  SidebarLayout,
  TopNav,
  type NavContext,
} from "@vitalflow/ui/layout";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SurfaceSwitcher } from "../../../components/surface-switcher.js";
import { SURFACE_LABELS, surfaceForPath, type Surface } from "../../../lib/roles.js";
import { navFor } from "../../../nav/index.js";

export interface AppShellProps {
  availableSurfaces: readonly Surface[];
  permissions: readonly string[];
  user: { name: string; email?: string; avatarUrl?: string };
  children: ReactNode;
}

const SURFACE_ICONS = {
  provider: HeartPulse,
  admin: Shield,
  patient: UserRound,
} as const;

export function AppShell({
  availableSurfaces,
  permissions,
  user,
  children,
}: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeSurface = surfaceForPath(pathname);
  const sections = navFor(activeSurface);
  const ctx: NavContext = { permissions, pathname };
  const BrandIcon = SURFACE_ICONS[activeSurface];

  return (
    <SidebarLayout
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
      sidebar={
        <Sidebar
          brand={
            <span className="flex items-center gap-2 font-semibold">
              <BrandIcon className="h-5 w-5 text-primary" aria-hidden />
              VitalFlow
              {activeSurface !== "provider" ? (
                <span className="text-xs font-normal text-muted-foreground">
                  · {SURFACE_LABELS[activeSurface]}
                </span>
              ) : null}
            </span>
          }
          sections={sections}
          ctx={ctx}
          LinkComponent={NextLink}
        />
      }
      topNav={
        <TopNav
          user={{ ...user, roleLabel: SURFACE_LABELS[activeSurface] }}
          onOpenMobileNav={() => setMobileOpen(true)}
          actions={<SurfaceSwitcher active={activeSurface} available={availableSurfaces} />}
        />
      }
    >
      {children}
    </SidebarLayout>
  );
}
