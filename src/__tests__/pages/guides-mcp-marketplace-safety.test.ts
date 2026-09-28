import { describe, expect, it } from "vitest";
import { PUBLIC_RATE_LIMITS } from "../../pages/guides/mcp-marketplace-safety";
import {
  getProfileForGroup,
  RATE_LIMIT_DEFAULT_SCOPE
} from "../../server/rate-limit/config";

describe("MCP marketplace safety guide", () => {
  it("keeps its public rate-limit examples aligned with the API configuration", () => {
    for (const publicLimit of PUBLIC_RATE_LIMITS) {
      const profile = getProfileForGroup(publicLimit.route);

      expect(profile, publicLimit.route).not.toBeNull();
      expect(profile.buckets, publicLimit.route).toEqual(publicLimit.buckets);
      expect(profile.scope || RATE_LIMIT_DEFAULT_SCOPE, publicLimit.route).toBe(publicLimit.scope);
    }
  });
});
