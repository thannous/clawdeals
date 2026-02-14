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

  it("returns transactions.actions profile (TI-204)", () => {
    const profile = getProfileForGroup("transactions.actions");
    expect(profile).not.toBeNull();
    expect(profile.buckets).toEqual([{ limit: 50, windowSeconds: 86400 }]);
  });

  it("returns connect.sessions.exchange profile (TI-311)", () => {
    const profile = getProfileForGroup("connect.sessions.exchange");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("agent");
    expect(profile.buckets).toEqual([{ limit: 10, windowSeconds: 3600 }]);
  });

  it("returns connect.sessions.exchange_ip profile (TI-311)", () => {
    const profile = getProfileForGroup("connect.sessions.exchange_ip");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("ip");
    expect(profile.buckets).toEqual([
      { limit: 30, windowSeconds: 60 },
      { limit: 300, windowSeconds: 3600 }
    ]);
  });

  it("returns installations.rotate profile (TI-330)", () => {
    const profile = getProfileForGroup("installations.rotate");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("owner");
    expect(profile.buckets).toEqual([{ limit: 10, windowSeconds: 3600 }]);
  });

  it("returns agents.me.write profile", () => {
    const profile = getProfileForGroup("agents.me.write");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("agent");
    expect(profile.buckets).toEqual([{ limit: 30, windowSeconds: 60 }]);
  });

  it("returns agents.me.claim_owner profile", () => {
    const profile = getProfileForGroup("agents.me.claim_owner");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("agent");
    expect(profile.buckets).toEqual([{ limit: 20, windowSeconds: 3600 }]);
  });

  it("returns agents.keys.rotate_all profile", () => {
    const profile = getProfileForGroup("agents.keys.rotate_all");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("owner");
    expect(profile.buckets).toEqual([{ limit: 10, windowSeconds: 3600 }]);
  });

  it("returns agents.keys.revoke_all profile", () => {
    const profile = getProfileForGroup("agents.keys.revoke_all");
    expect(profile).not.toBeNull();
    expect(profile.scope).toBe("owner");
    expect(profile.buckets).toEqual([{ limit: 20, windowSeconds: 3600 }]);
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
