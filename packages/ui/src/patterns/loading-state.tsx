import * as React from "react";

import { Loader2 } from "../icons/index.js";
import { cn } from "../utils/cn.js";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}

export const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ className, label = "Loading…", ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-lg px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  ),
);
LoadingState.displayName = "LoadingState";

/**
 * Block-level skeleton that mimics content shape. Prefer this over a spinner
 * when the layout's real estate is known ahead of time.
 */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
