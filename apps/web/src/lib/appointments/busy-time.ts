/**
 * Pure helpers for detecting appointment-slot conflicts without a database round-trip.
 *
 * Matches the DB-level exclusion constraint `appointments_no_overlap` on
 * `(provider_id, tstzrange(start_at, end_at, '[)'))` — half-open interval,
 * so back-to-back slots sharing a boundary do NOT conflict.
 *
 * Spec: docs/specs/UC-B5-slot-conflict-detection.md
 */

export interface BusyWindow {
  readonly id: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly provider_id: string;
  readonly location_id: string | null;
  readonly status: string;
  readonly provider_name?: string | null;
}

export interface ProposedSlot {
  readonly start_at: string;
  readonly end_at: string;
  readonly provider_id: string;
  readonly location_id: string | null;
}

export interface Conflict {
  readonly id: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly kind: "provider" | "location";
  readonly provider_name?: string | null;
}

/**
 * Returns the subset of `busy` windows that conflict with `proposed`.
 *
 * A window conflicts when its half-open interval [start, end) overlaps
 * `proposed`'s half-open interval AND at least one of:
 *  - `provider_id` matches (provider cannot be in two rooms at once) — "provider" kind
 *  - `location_id` matches and `provider_id` differs — "location" kind (room contention)
 *
 * Location contention only applies when `proposed.location_id` is non-null.
 * If the same window would trigger both kinds, it is reported once as "provider"
 * (the stricter rule — same-provider conflicts are hard-blocking, location-only
 * conflicts are soft-warnings per BR-6 of the spec).
 */
export function findConflicts(busy: readonly BusyWindow[], proposed: ProposedSlot): Conflict[] {
  const ps = Date.parse(proposed.start_at);
  const pe = Date.parse(proposed.end_at);
  const out: Conflict[] = [];
  for (const w of busy) {
    const ws = Date.parse(w.start_at);
    const we = Date.parse(w.end_at);
    // Half-open overlap: [ws, we) intersects [ps, pe) iff ws < pe AND ps < we.
    if (!(ws < pe && ps < we)) continue;

    const sameProvider = w.provider_id === proposed.provider_id;
    const sameLocation = proposed.location_id !== null && w.location_id === proposed.location_id;

    if (sameProvider) {
      out.push({
        id: w.id,
        start_at: w.start_at,
        end_at: w.end_at,
        kind: "provider",
        provider_name: w.provider_name ?? null,
      });
    } else if (sameLocation) {
      out.push({
        id: w.id,
        start_at: w.start_at,
        end_at: w.end_at,
        kind: "location",
        provider_name: w.provider_name ?? null,
      });
    }
  }
  return out;
}

/**
 * Statuses whose rows should be excluded from busy-time queries — matches the
 * WHERE clause of the `appointments_no_overlap` exclusion constraint. Keep in
 * sync; drift between UI and DB would make the friendly UX disagree with the
 * authoritative backstop.
 */
export const NON_BUSY_STATUSES: readonly string[] = ["cancelled", "no_show", "rescheduled"];

export function isBusyStatus(status: string): boolean {
  return !NON_BUSY_STATUSES.includes(status);
}
