"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";

import { LogOut, Menu, Settings, UserRound } from "../icons/index.js";
import { Button } from "../primitives/button.js";
import { Separator } from "../primitives/separator.js";
import { cn } from "../utils/cn.js";

export interface TopNavUser {
  name: string;
  email?: string;
  avatarUrl?: string;
  /** Roles shown as a subdued chip next to the avatar. */
  roleLabel?: string;
}

export interface TopNavProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  user?: TopNavUser;
  /** Left-aligned slot for breadcrumbs. */
  breadcrumbs?: React.ReactNode;
  /** Right-aligned slot for search / notifications. */
  actions?: React.ReactNode;
  /** Shown as a hamburger action on narrow viewports. */
  onOpenMobileNav?: () => void;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
}

export const TopNav = React.forwardRef<HTMLElement, TopNavProps>(
  (
    {
      className,
      title,
      user,
      breadcrumbs,
      actions,
      onOpenMobileNav,
      onSignOut,
      onOpenProfile,
      onOpenSettings,
      ...props
    },
    ref,
  ) => (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-30 flex h-[var(--vf-topnav-height)] items-center gap-3 border-b border-border bg-background px-4",
        className,
      )}
      {...props}
    >
      {onOpenMobileNav ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
      ) : null}

      <div className="min-w-0 flex-1">
        {breadcrumbs ? (
          breadcrumbs
        ) : title ? (
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
        ) : null}
      </div>

      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}

      {user ? (
        <>
          <Separator orientation="vertical" className="mx-1 hidden h-6 md:block" />
          <DropdownPrimitive.Root>
            <DropdownPrimitive.Trigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Open account menu"
              >
                <Avatar user={user} />
                <div className="hidden text-left sm:block">
                  <div className="text-sm font-medium leading-tight">{user.name}</div>
                  {user.roleLabel ? (
                    <div className="text-xs text-muted-foreground">{user.roleLabel}</div>
                  ) : null}
                </div>
              </button>
            </DropdownPrimitive.Trigger>
            <DropdownPrimitive.Portal>
              <DropdownPrimitive.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-56 rounded-md border border-border bg-background p-1 shadow-vf-md"
              >
                {user.email ? (
                  <div className="px-3 py-2">
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </div>
                ) : null}
                <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
                <DropdownItem onSelect={onOpenProfile} icon={<UserRound className="h-4 w-4" aria-hidden />}>
                  Profile
                </DropdownItem>
                <DropdownItem onSelect={onOpenSettings} icon={<Settings className="h-4 w-4" aria-hidden />}>
                  Settings
                </DropdownItem>
                <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
                <DropdownItem
                  onSelect={onSignOut}
                  icon={<LogOut className="h-4 w-4" aria-hidden />}
                  variant="destructive"
                >
                  Sign out
                </DropdownItem>
              </DropdownPrimitive.Content>
            </DropdownPrimitive.Portal>
          </DropdownPrimitive.Root>
        </>
      ) : null}
    </header>
  ),
);
TopNav.displayName = "TopNav";

function Avatar({ user }: { user: TopNavUser }) {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <AvatarPrimitive.Root className="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
      {user.avatarUrl ? (
        <AvatarPrimitive.Image
          src={user.avatarUrl}
          alt=""
          className="aspect-square h-full w-full"
        />
      ) : null}
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
        {initials || "??"}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

function DropdownItem({
  children,
  icon,
  onSelect,
  variant = "default",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onSelect?: () => void;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground",
        variant === "destructive" && "text-destructive focus:bg-destructive/10 focus:text-destructive",
      )}
    >
      {icon}
      {children}
    </DropdownPrimitive.Item>
  );
}
