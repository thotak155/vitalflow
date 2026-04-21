import { Card, CardContent, CardHeader } from "@vitalflow/ui";

import { SkeletonBar, SkeletonLine, SkeletonTableRow } from "../components/skeletons.js";

/**
 * Generic top-level loading UI. Fires during initial SSR + any navigation
 * between routes that don't have their own loading.tsx. Keep it low-effort
 * and close to the real content shape so layout shift stays minimal.
 */
export default function RootLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <SkeletonLine width="w-48" />
      <SkeletonBar className="h-6 w-64" />

      <Card>
        <CardHeader>
          <SkeletonLine width="w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <SkeletonTableRow />
          <SkeletonTableRow />
          <SkeletonTableRow />
          <SkeletonTableRow />
        </CardContent>
      </Card>
    </div>
  );
}
