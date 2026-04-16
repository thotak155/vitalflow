import * as React from "react";

import { AlertTriangle, type LucideIcon } from "../icons/index.js";
import { cn } from "../utils/cn.js";

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** When provided, shows the message in a collapsed technical-details block. */
  technical?: string;
}

export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ className, icon: Icon = AlertTriangle, title, description, action, technical, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <div className="text-base font-medium text-foreground">{title}</div>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
      {technical ? (
        <details className="mt-2 w-full max-w-sm text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">
            {technical}
          </pre>
        </details>
      ) : null}
    </div>
  ),
);
ErrorState.displayName = "ErrorState";
