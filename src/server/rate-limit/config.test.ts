import { describe, expect, it } from "vitest";
import { formatLimitLabel, getProfileForGroup, normalizeKeyPart } from "./config";

describe("formatLimitLabel", () => {
  it("formats seconds and minutes", () => {
    expect(formatLimitLabel(30, 600)).toBe("30/10m");
  });
});

describe("getProfileForGroup", () => {
  it("returns profile for known group", () => {
    const profile = getProfileForGroup("reports.create");
    expect(profile).not.toBeNull();
    expect(profile.buckets).toBeDefined();
    expect(profile.buckets.length).toBeGreaterThan(0);
  });

  it("returns offers.actions profile (TI-201)", () => {
    const profile = getProfileForGroup("offers.actions");
    expect(profile).not.toBeNull();
    expect(profile.buckets).toEqual([{ limit: 100, windowSeconds: 86400 }]);
  });

  it("returns null for unknown group", () => {
    const profile = getProfileForGroup("nonexistent.group");
    expect(profile).toBeNull();
  });
});

describe("normalizeKeyPart", () => {
  it("replaces special characters with underscores", () => {
    expect(normalizeKeyPart("hello world!@#")).toBe("hello_world___");
    expect(normalizeKeyPart("agent:123")).toBe("agent:123");
    expect(normalizeKeyPart("user/path?q=1")).toBe("user_path_q_1");
  });
});
