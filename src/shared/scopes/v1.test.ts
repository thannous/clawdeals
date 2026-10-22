import { describe, expect, it } from "vitest";

import { normalizeConnectRequestedScopes, normalizeRequestedScopes, V1_SCOPES_DEFAULT, V1_SCOPES_READ_DEFAULT } from "./v1";

const SENSITIVE_ACTION_SCOPES = [
  "transactions:write",
  "evidence:read",
  "evidence:write",
  "ratings:write"
];

describe("v1 delegated scopes", () => {
  it("does not silently grant sensitive action scopes to legacy installations", () => {
    const result = normalizeRequestedScopes(["agent:read"]);
    expect(result.normalized).toEqual(V1_SCOPES_READ_DEFAULT);
    expect(result.normalized).not.toContain("watchlists:write");
    for (const scope of SENSITIVE_ACTION_SCOPES) {
      expect(result.normalized).not.toContain(scope);
    }
  });

  it("expands a combined legacy request to the v1 default", () => {
    expect(normalizeRequestedScopes(["agent:read", "agent:write"]).normalized).toEqual(V1_SCOPES_DEFAULT);
  });

  it("rejects unknown and empty legacy connection grants", () => {
    expect(normalizeConnectRequestedScopes(["agent:read"])).toEqual(V1_SCOPES_READ_DEFAULT);
    expect(normalizeConnectRequestedScopes([])).toBeNull();
    expect(normalizeConnectRequestedScopes(["admin:everything"])).toBeNull();
    expect(normalizeConnectRequestedScopes(["contacts:reveal"])).toBeNull();
  });
});
