import { describe, expect, it } from "vitest";

import {
  isKnownScope,
  normalizeRequestedScopes,
  V1_SCOPES_DEFAULT,
  V1_SCOPES_UPGRADE_ONLY
} from "./v1";

const SENSITIVE_ACTION_SCOPES = [
  "transactions:write",
  "evidence:read",
  "evidence:write",
  "ratings:write"
];

describe("v1 delegated scopes", () => {
  it("recognizes sensitive action scopes as upgrade-only", () => {
    expect(V1_SCOPES_UPGRADE_ONLY).toEqual(expect.arrayContaining(SENSITIVE_ACTION_SCOPES));
    for (const scope of SENSITIVE_ACTION_SCOPES) {
      expect(isKnownScope(scope)).toBe(true);
      expect(V1_SCOPES_DEFAULT).not.toContain(scope);
    }
  });

  it("normalizes explicit requests for the new scopes", () => {
    const result = normalizeRequestedScopes(SENSITIVE_ACTION_SCOPES);
    expect(result.unknown).toEqual([]);
    expect(result.normalized).toEqual(SENSITIVE_ACTION_SCOPES);
  });

  it("does not silently grant sensitive action scopes to legacy installations", () => {
    const result = normalizeRequestedScopes(["agent:read"]);
    expect(result.normalized).toEqual(V1_SCOPES_DEFAULT);
    for (const scope of SENSITIVE_ACTION_SCOPES) {
      expect(result.normalized).not.toContain(scope);
    }
  });
});
