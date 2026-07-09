import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_GROUP_MATCHERS } from "../routes/route-groups";
import { formatLimitLabel, getProfileForGroup, normalizeKeyPart } from "./config";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const ROUTE_GROUP_LITERAL_RE = /\brouteGroup\s*:\s*["']([^"']+)["']/g;

const ROUTE_GROUP_PROFILE_ALLOWLIST = new Set<string>([
  // Add entries only when a literal routeGroup intentionally has no rate-limit profile.
]);

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    files.push(path);
  }

  return files;
}

function collectLiteralRouteGroups() {
  const groups = new Set<string>();
  for (const file of collectSourceFiles(join(REPO_ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(ROUTE_GROUP_LITERAL_RE)) {
      groups.add(match[1]);
    }
  }
  return groups;
}

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

  it("has profiles for every explicit route group", () => {
    const explicitGroups = new Set([
      ...collectLiteralRouteGroups(),
      ...ROUTE_GROUP_MATCHERS.map((matcher) => matcher.group)
    ]);
    const missingProfiles = [...explicitGroups]
      .filter((group) => !ROUTE_GROUP_PROFILE_ALLOWLIST.has(group))
      .filter((group) => !getProfileForGroup(group))
      .sort();

    expect(missingProfiles).toEqual([]);
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
