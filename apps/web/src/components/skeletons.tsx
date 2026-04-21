import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@vitalflow/ui";

/**
 * CSS-only skeletons used by `loading.tsx` route files. Server components —
 * zero client JS. When a real charting library lands, the chart-shaped
 * skeletons below swap out component-for-component with their loading
 * states.
 */

export function SkeletonBar({ className = "h-4" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden />;
}

export function SkeletonLine({ width = "w-24" }: { width?: string }) {
  return <SkeletonBar className={`h-3 ${width}`} />;
}

export function SkeletonKpiCard() {
  return (
    <Card>
      <CardHeader className="pb-1">
        <SkeletonLine width="w-20" />
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        <SkeletonBar className="h-7 w-16" />
        <SkeletonLine width="w-28" />
        <SkeletonLine width="w-32" />
      </CardContent>
    </Card>
  );
}

export function SkeletonPanel({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        {title ? <SkeletonLine width="w-32" /> : <SkeletonLine width="w-24" />}
      </CardHeader>
      <CardContent className="pt-0">
        {children ?? (
          <div className="space-y-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <SkeletonLine width="w-24" />
      <div className="flex-1">
        <SkeletonBar className="h-2 w-full" />
      </div>
      <SkeletonLine width="w-16" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 6 }: { cols?: number }) {
  return (
    <div className="flex gap-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="flex-1">
          <SkeletonLine width={i === 0 ? "w-20" : i % 2 === 0 ? "w-24" : "w-16"} />
        </div>
      ))}
    </div>
  );
}
