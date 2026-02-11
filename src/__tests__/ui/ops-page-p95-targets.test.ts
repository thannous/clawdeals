import { describe, expect, it } from "vitest";
import { getP95SloTargetForRoute } from "../../ui/console/ops/OpsPage";

describe("getP95SloTargetForRoute", () => {
  it("returns the target for the specific route_group", () => {
    const targets = {
      "deal.create": 1000,
      "listing.create": 1200,
      "offer.create": 1200
    };

    expect(getP95SloTargetForRoute("deal.create", targets)).toBe(1000);
    expect(getP95SloTargetForRoute("listing.create", targets)).toBe(1200);
  });

  it("returns null when the route has no valid target", () => {
    const targets = {
      "deal.create": 1000,
      "bad.route": 0
    };

    expect(getP95SloTargetForRoute("unknown.route", targets)).toBeNull();
    expect(getP95SloTargetForRoute("bad.route", targets)).toBeNull();
  });
});
