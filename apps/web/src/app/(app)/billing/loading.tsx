import { Card, CardContent } from "@vitalflow/ui";

import {
  SkeletonBar,
  SkeletonKpiCard,
  SkeletonLine,
  SkeletonPanel,
  SkeletonTableRow,
} from "../../../components/skeletons.js";

/**
 * Dashboard-shaped skeleton. Matches the overview layout: filter bar,
 * 4 KPI cards, 2 panel rows. Layout-compatible with the rendered page so
 * the only visible change on load is text appearing in the placeholder.
 *
 * The tab nav is rendered by the layout, which itself is SSR-fast (just a
 * permission check + a row of links) — so this skeleton only fills the
 * content region under it.
 */
export default function BillingLoading() {
  return (
    <div className="space-y-4">
      {/* Filter bar skeleton */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex gap-2">
            <SkeletonBar className="h-7 w-16" />
            <SkeletonBar className="h-7 w-24" />
            <SkeletonBar className="h-7 w-24" />
            <SkeletonBar className="h-7 w-28" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <SkeletonLine />
              <SkeletonBar className="h-9" />
            </div>
            <div className="space-y-1.5">
              <SkeletonLine />
              <SkeletonBar className="h-9" />
            </div>
            <div className="space-y-1.5">
              <SkeletonLine />
              <SkeletonBar className="h-9" />
            </div>
            <div className="flex items-end gap-2">
              <SkeletonBar className="h-9 w-20" />
              <SkeletonBar className="h-9 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 1 — KPI cards */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SkeletonKpiCard />
        <SkeletonKpiCard />
        <SkeletonKpiCard />
        <SkeletonKpiCard />
      </section>

      {/* Row 2 — 2 panels */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </section>

      {/* Row 3 — feeds */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="space-y-1 p-3">
              <SkeletonLine width="w-32" />
              <SkeletonLine width="w-24" />
            </div>
            <SkeletonTableRow cols={4} />
            <SkeletonTableRow cols={4} />
            <SkeletonTableRow cols={4} />
          </CardContent>
        </Card>
        <SkeletonPanel />
      </section>
    </div>
  );
}
