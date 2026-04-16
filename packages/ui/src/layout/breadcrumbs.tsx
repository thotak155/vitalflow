import * as React from "react";

import { ChevronRight } from "../icons/index.js";
import { cn } from "../utils/cn.js";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface AppBreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: readonly BreadcrumbItem[];
  /** Link component injected by the host app (Next.js Link, React Router Link, etc.). */
  LinkComponent?: React.ComponentType<
    { href: string; className?: string; children?: React.ReactNode } & Record<string, unknown>
  >;
}

const DefaultLink: NonNullable<AppBreadcrumbsProps["LinkComponent"]> = ({
  href,
  children,
  ...rest
}) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export const AppBreadcrumbs = React.forwardRef<HTMLElement, AppBreadcrumbsProps>(
  ({ className, items, LinkComponent = DefaultLink, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label="Breadcrumb"
      className={cn("flex min-w-0 items-center text-sm text-muted-foreground", className)}
      {...props}
    >
      <ol className="flex min-w-0 items-center gap-1.5">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex min-w-0 items-center gap-1.5">
              {idx > 0 ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              ) : null}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn("truncate", isLast && "font-medium text-foreground")}
                >
                  {item.label}
                </span>
              ) : (
                <LinkComponent
                  href={item.href}
                  className="truncate hover:text-foreground focus:outline-none focus:underline"
                >
                  {item.label}
                </LinkComponent>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  ),
);
AppBreadcrumbs.displayName = "AppBreadcrumbs";
