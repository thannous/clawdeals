import { describe, expect, it } from "vitest";

import { isQuietNow } from "./quiet-hours";

describe("quiet hours", () => {
  it("returns false when disabled or invalid", () => {
    const now = new Date("2026-02-10T12:00:00.000Z");
    expect(isQuietNow({ now, timezone: "UTC", quietEnabled: false, startMin: 1320, endMin: 480 })).toBe(false);
    expect(isQuietNow({ now, timezone: "UTC", quietEnabled: true, startMin: null, endMin: 480 })).toBe(false);
    expect(isQuietNow({ now, timezone: "UTC", quietEnabled: true, startMin: 1320, endMin: null })).toBe(false);
    expect(isQuietNow({ now, timezone: "UTC", quietEnabled: true, startMin: -1, endMin: 0 })).toBe(false);
  });

  it("supports non-wrapping windows", () => {
    const tz = "UTC";
    expect(isQuietNow({ now: new Date("2026-02-10T07:59:00.000Z"), timezone: tz, quietEnabled: true, startMin: 8 * 60, endMin: 22 * 60 })).toBe(false);
    expect(isQuietNow({ now: new Date("2026-02-10T08:00:00.000Z"), timezone: tz, quietEnabled: true, startMin: 8 * 60, endMin: 22 * 60 })).toBe(true);
    expect(isQuietNow({ now: new Date("2026-02-10T21:59:00.000Z"), timezone: tz, quietEnabled: true, startMin: 8 * 60, endMin: 22 * 60 })).toBe(true);
    expect(isQuietNow({ now: new Date("2026-02-10T22:00:00.000Z"), timezone: tz, quietEnabled: true, startMin: 8 * 60, endMin: 22 * 60 })).toBe(false);
  });

  it("supports wrapping windows across midnight", () => {
    const tz = "UTC";
    // quiet 22:00 -> 08:00
    expect(isQuietNow({ now: new Date("2026-02-10T21:59:00.000Z"), timezone: tz, quietEnabled: true, startMin: 22 * 60, endMin: 8 * 60 })).toBe(false);
    expect(isQuietNow({ now: new Date("2026-02-10T22:00:00.000Z"), timezone: tz, quietEnabled: true, startMin: 22 * 60, endMin: 8 * 60 })).toBe(true);
    expect(isQuietNow({ now: new Date("2026-02-11T01:00:00.000Z"), timezone: tz, quietEnabled: true, startMin: 22 * 60, endMin: 8 * 60 })).toBe(true);
    expect(isQuietNow({ now: new Date("2026-02-11T07:59:00.000Z"), timezone: tz, quietEnabled: true, startMin: 22 * 60, endMin: 8 * 60 })).toBe(true);
    expect(isQuietNow({ now: new Date("2026-02-11T08:00:00.000Z"), timezone: tz, quietEnabled: true, startMin: 22 * 60, endMin: 8 * 60 })).toBe(false);
  });

  it("treats start == end as full-day quiet", () => {
    const tz = "UTC";
    expect(isQuietNow({ now: new Date("2026-02-10T12:00:00.000Z"), timezone: tz, quietEnabled: true, startMin: 0, endMin: 0 })).toBe(true);
  });
});

