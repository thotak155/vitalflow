"use client";

import * as React from "react";

import { Separator } from "../primitives/separator.js";
import { cn } from "../utils/cn.js";

import { filterNav, isActiveHref, type NavContext, type NavItem, type NavSection } from "./nav.js";

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Top-of-sidebar brand slot (logo + wordmark). */
  brand?: React.ReactNode;
  /** Nav model; sections are filtered by the current user's permissions. */
  sections: readonly NavSection[];
  ctx: NavContext;
  footer?: React.ReactNode;
  /**
   * Link component the consuming app injects. Apps pass Next.js `Link`
   * here so the sidebar stays framework-agnostic and tree-shake-friendly.
   */
  LinkComponent?: React.ComponentType<
    { href: string; className?: string; children?: React.ReactNode } & Record<string, unknown>
  >;
}

const DefaultLink: NonNullable<SidebarProps["LinkComponent"]> = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, brand, sections, ctx, footer, LinkComponent = DefaultLink, ...props }, ref) => {
    const visible = filterNav(sections, ctx);
    return (
      <aside
        ref={ref}
        aria-label="Primary"
        className={cn(
          "border-border bg-background flex h-full w-[var(--vf-sidebar-width)] flex-col border-r",
          className,
        )}
        {...props}
      >
        {brand ? (
          <div className="flex h-[var(--vf-topnav-height)] items-center gap-2 px-4">{brand}</div>
        ) : null}
        <Separator />
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {visible.map((section, idx) => (
            <div key={section.id} className={idx === 0 ? undefined : "mt-6"}>
              {section.label ? (
                <div className="text-muted-foreground px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide">
                  {section.label}
                </div>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.id}
                    item={item}
                    active={isActiveHref(ctx.pathname, item.href)}
                    LinkComponent={LinkComponent}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {footer ? (
          <>
            <Separator />
            <div className="p-3">{footer}</div>
          </>
        ) : null}
      </aside>
    );
  },
);
Sidebar.displayName = "Sidebar";

function SidebarLink({
  item,
  active,
  LinkComponent,
}: {
  item: NavItem;
  active: boolean;
  LinkComponent: NonNullable<SidebarProps["LinkComponent"]>;
}) {
  const Icon = item.icon;
  const disabled = item.comingSoon;
  const className = cn(
    "group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2",
    active
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    disabled && "pointer-events-none opacity-60",
  );
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined ? (
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
          {item.badge}
        </span>
      ) : null}
      {item.comingSoon ? (
        <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
          Soon
        </span>
      ) : null}
    </>
  );
  return (
    <li>
      {disabled ? (
        <span className={className} aria-disabled>
          {content}
        </span>
      ) : (
        <LinkComponent
          href={item.href}
          className={className}
          aria-current={active ? "page" : undefined}
        >
          {content}
        </LinkComponent>
      )}
    </li>
  );
}
