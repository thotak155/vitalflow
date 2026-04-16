"use client";

import * as React from "react";

import { Drawer, DrawerContent } from "../primitives/drawer.js";
import { cn } from "../utils/cn.js";

export interface SidebarLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar: React.ReactNode;
  topNav: React.ReactNode;
  /** Controlled open state for the mobile drawer (optional). */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

/**
 * The canonical app shell for provider and admin: sticky top nav + fixed
 * left sidebar on ≥md, hamburger-driven Drawer on smaller viewports.
 *
 * The sidebar and topNav are passed as slots so each app can inject its own
 * role-aware nav model and user data without the shell knowing about either.
 */
export const SidebarLayout = React.forwardRef<HTMLDivElement, SidebarLayoutProps>(
  ({ className, sidebar, topNav, mobileOpen, onMobileOpenChange, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex min-h-screen bg-background text-foreground", className)}
      {...props}
    >
      <div className="hidden md:block">{sidebar}</div>

      <Drawer open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DrawerContent side="left" className="w-[var(--vf-sidebar-width)] p-0">
          {sidebar}
        </DrawerContent>
      </Drawer>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {topNav}
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl space-y-8">{children}</div>
        </main>
      </div>
    </div>
  ),
);
SidebarLayout.displayName = "SidebarLayout";
