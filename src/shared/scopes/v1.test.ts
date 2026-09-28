import { describe, expect, it } from "vitest";

import {
  normalizeRequestedScopes,
  V1_SCOPES_DEFAULT
} from "./v1";

const SENSITIVE_ACTION_SCOPES = [
  "transactions:write",
  "evidence:read",
  "evidence:write",
  "ratings:write"
];

describe("v1 delegated scopes", () => {
  it("does not silently grant sensitive action scopes to legacy installations", () => {
    const result = normalizeRequestedScopes(["agent:read"]);
    expect(result.normalized).toEqual(V1_SCOPES_DEFAULT);
    for (const scope of SENSITIVE_ACTION_SCOPES) {
      expect(result.normalized).not.toContain(scope);
    }
  });
});
