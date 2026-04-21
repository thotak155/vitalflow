import * as React from "react";

import { cn } from "../utils/cn.js";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, title, description, eyebrow, actions, children, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "border-border flex flex-col gap-4 border-b pb-6 md:flex-row md:items-start md:justify-between",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-foreground truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  ),
);
PageHeader.displayName = "PageHeader";
