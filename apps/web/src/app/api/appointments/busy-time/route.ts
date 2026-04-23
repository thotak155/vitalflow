import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { NextResponse, type NextRequest } from "next/server";

import { NON_BUSY_STATUSES, type BusyWindow } from "../../../../lib/appointments/busy-time.js";
import { getSession } from "../../../../lib/session.js";

/**
 * GET /api/appointments/busy-time?provider_id=&date=&location_id=
 *
 * Returns the day's appointment windows that the booking form should treat
 * as "busy" — same filter the DB exclusion constraint uses, plus tenant scope
 * via RLS. The pure helper `findConflicts()` then categorizes each row as
 * provider-conflict (hard block) or location-conflict (soft warning).
 *
 * Spec: docs/specs/UC-B5-slot-conflict-detection.md
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.permissions.includes("schedule:write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const providerId = url.searchParams.get("provider_id");
  const date = url.searchParams.get("date");
  const locationId = url.searchParams.get("location_id");

  if (!providerId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(dayStart.getTime())) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const supabase = await createVitalFlowServerClient();
  type BusyRowDb = {
    id: string;
    start_at: string;
    end_at: string;
    provider_id: string;
    location_id: string | null;
    status: string;
    provider: { full_name: string | null; email: string } | null;
  };
  let q = supabase
    .from("appointments")
    .select(
      "id, start_at, end_at, provider_id, location_id, status, " +
        "provider:profiles!appointments_provider_profile_fkey(full_name, email)",
    )
    .eq("tenant_id", session.tenantId)
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString())
    .not("status", "in", `(${NON_BUSY_STATUSES.join(",")})`);
  if (locationId) {
    q = q.or(`provider_id.eq.${providerId},location_id.eq.${locationId}`);
  } else {
    q = q.eq("provider_id", providerId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const windows: BusyWindow[] = ((data as BusyRowDb[] | null) ?? []).map((r) => ({
    id: r.id,
    start_at: r.start_at,
    end_at: r.end_at,
    provider_id: r.provider_id,
    location_id: r.location_id,
    status: r.status,
    provider_name: r.provider?.full_name ?? r.provider?.email ?? null,
  }));
  return NextResponse.json({ windows });
}
