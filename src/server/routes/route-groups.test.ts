import { describe, expect, it } from "vitest";

import { matchRouteGroup } from "./route-groups";

describe("route groups", () => {
  it("matches offers.actions for accept/decline/cancel", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/accept", sp)).toBe(
      "offers.actions"
    );
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/decline", sp)).toBe(
      "offers.actions"
    );
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/cancel", sp)).toBe(
      "offers.actions"
    );
  });

  it("still matches offers.write for other /v1/offers routes", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/counter", sp)).toBe(
      "offers.write"
    );
    expect(matchRouteGroup("PATCH", "/api/v1/offers/00000000-0000-4000-a000-000000000123", sp)).toBe(
      "offers.write"
    );
  });
});

