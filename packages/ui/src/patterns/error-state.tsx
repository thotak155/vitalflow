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
  (
    { className, icon: Icon = AlertTriangle, title, description, action, technical, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className={cn(
        "border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="bg-destructive/10 text-destructive flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <div className="text-foreground text-base font-medium">{title}</div>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
      {technical ? (
        <details className="text-muted-foreground mt-2 w-full max-w-sm text-left text-xs">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <pre className="bg-muted mt-2 overflow-auto whitespace-pre-wrap break-all rounded p-2 font-mono">
            {technical}
          </pre>
        </details>
      ) : null}
    </div>
  ),
);
ErrorState.displayName = "ErrorState";
