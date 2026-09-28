import { describe, expect, it } from "vitest";

import { __test } from "./listings-duplicates";

describe("listings duplicates fingerprint", () => {

  it("bands prices with piecewise steps", () => {
    expect(__test.computePriceBand(99)).toBe("90-99");
    expect(__test.computePriceBand(100)).toBe("100-124");
    expect(__test.computePriceBand(499)).toBe("475-499");
    expect(__test.computePriceBand(500)).toBe("500-549");
    expect(__test.computePriceBand(1999)).toBe("1950-1999");
    expect(__test.computePriceBand(2000)).toBe("2000-2099");
  });

  it("buckets geo to 2 decimals", () => {
    expect(__test.computeGeoBucket({ geoLat: 48.8566123, geoLng: 2.3522219 })).toBe("48.86,2.35");
    expect(__test.computeGeoBucket({ geoLat: null, geoLng: 2 })).toBe("none");
  });
});

