import { describe, expect, it } from "vitest";

import { findConflicts, type BusyWindow } from "./busy-time.js";

const W = (
  partial: Partial<BusyWindow> & Pick<BusyWindow, "id" | "start_at" | "end_at">,
): BusyWindow => ({
  provider_id: "p1",
  location_id: "l1",
  status: "scheduled",
  provider_name: null,
  ...partial,
});

const PROPOSED = {
  start_at: "2026-04-22T10:00:00.000Z",
  end_at: "2026-04-22T10:30:00.000Z",
  provider_id: "p1",
  location_id: "l1" as string | null,
};

describe("findConflicts", () => {
  it("returns empty when busy list is empty", () => {
    expect(findConflicts([], PROPOSED)).toEqual([]);
  });

  it("returns empty when proposed is entirely before existing window", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T11:00:00.000Z", end_at: "2026-04-22T11:30:00.000Z" }),
    ];
    expect(findConflicts(busy, PROPOSED)).toEqual([]);
  });

  it("returns empty when proposed is entirely after existing window", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T09:00:00.000Z", end_at: "2026-04-22T09:30:00.000Z" }),
    ];
    expect(findConflicts(busy, PROPOSED)).toEqual([]);
  });

  it("allows back-to-back at exact end→start boundary (half-open interval)", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T09:30:00.000Z", end_at: "2026-04-22T10:00:00.000Z" }),
    ];
    expect(findConflicts(busy, PROPOSED)).toEqual([]);
  });

  it("allows back-to-back at exact start→end boundary (half-open interval)", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T10:30:00.000Z", end_at: "2026-04-22T11:00:00.000Z" }),
    ];
    expect(findConflicts(busy, PROPOSED)).toEqual([]);
  });

  it("flags PROVIDER conflict when same-provider window overlaps start", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T09:45:00.000Z", end_at: "2026-04-22T10:15:00.000Z" }),
    ];
    const result = findConflicts(busy, PROPOSED);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("provider");
    expect(result[0]?.id).toBe("b1");
  });

  it("flags PROVIDER conflict when same-provider window overlaps end", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T10:15:00.000Z", end_at: "2026-04-22T10:45:00.000Z" }),
    ];
    const result = findConflicts(busy, PROPOSED);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("provider");
  });

  it("flags PROVIDER conflict when same-provider window fully contains proposed", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T09:00:00.000Z", end_at: "2026-04-22T11:00:00.000Z" }),
    ];
    const result = findConflicts(busy, PROPOSED);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("provider");
  });

  it("flags PROVIDER conflict when proposed fully contains same-provider window", () => {
    const busy = [
      W({ id: "b1", start_at: "2026-04-22T10:10:00.000Z", end_at: "2026-04-22T10:20:00.000Z" }),
    ];
    const result = findConflicts(busy, PROPOSED);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("provider");
  });

  it("flags LOCATION conflict when different-provider window overlaps at same location", () => {
    const busy = [
      W({
        id: "b1",
        start_at: "2026-04-22T10:00:00.000Z",
        end_at: "2026-04-22T10:30:00.000Z",
        provider_id: "p2",
        location_id: "l1",
      }),
    ];
    const result = findConflicts(busy, PROPOSED);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("location");
  });

  it("returns empty when different-provider overlap is at a different location", () => {
    const busy = [
      W({
        id: "b1",
        start_at: "2026-04-22T10:00:00.000Z",
        end_at: "2026-04-22T10:30:00.000Z",
        provider_id: "p2",
        location_id: "l2",
      }),
    ];
    expect(findConflicts(busy, PROPOSED)).toEqual([]);
  });

  it("ignores location match when proposed location_id is null (no room bookkeeping)", () => {
    const busy = [
      W({
        id: "b1",
        start_at: "2026-04-22T10:00:00.000Z",
        end_at: "2026-04-22T10:30:00.000Z",
        provider_id: "p2",
        location_id: "l1",
      }),
    ];
    const proposedNoLoc = { ...PROPOSED, location_id: null };
    expect(findConflicts(busy, proposedNoLoc)).toEqual([]);
  });

  it("returns multiple conflicts when both provider and location clash", () => {
    const busy = [
      W({
        id: "p-clash",
        start_at: "2026-04-22T10:10:00.000Z",
        end_at: "2026-04-22T10:20:00.000Z",
        provider_id: "p1",
        location_id: "l2",
      }),
      W({
        id: "l-clash",
        start_at: "2026-04-22T10:00:00.000Z",
        end_at: "2026-04-22T10:30:00.000Z",
        provider_id: "p2",
        location_id: "l1",
      }),
    ];
    const result = findConflicts(busy, PROPOSED);
    const kinds = result.map((c) => c.kind).sort();
    expect(kinds).toEqual(["location", "provider"]);
  });

  it("treats same-provider + same-location as a PROVIDER conflict (not double-counted)", () => {
    const busy = [
      W({
        id: "b1",
        start_at: "2026-04-22T10:00:00.000Z",
        end_at: "2026-04-22T10:30:00.000Z",
        provider_id: "p1",
        location_id: "l1",
      }),
    ];
    const result = findConflicts(busy, PROPOSED);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("provider");
  });
});
