import { describe, expect, it } from "vitest";

import { mapOfferActionError } from "./offers";

describe("mapOfferActionError (TI-201)", () => {
  it("maps OFFER_NOT_FOUND to 404", () => {
    const mapped = mapOfferActionError({ message: "OFFER_NOT_FOUND" });
    expect(mapped.status).toBe(404);
    expect(mapped.code).toBe("OFFER_NOT_FOUND");
  });

  it("maps LISTING_LOCKED to 409", () => {
    const mapped = mapOfferActionError({ message: "LISTING_LOCKED" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("LISTING_LOCKED");
  });

  it("maps OFFER_NOT_ACTIONABLE:<STATUS> to 409 with details", () => {
    const mapped = mapOfferActionError({ message: "OFFER_NOT_ACTIONABLE:ACCEPTED" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("OFFER_NOT_ACTIONABLE");
    expect(mapped.details).toEqual({ status: "ACCEPTED" });
  });
});

