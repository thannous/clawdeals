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

  it("maps missing offer.accept policy to APPROVAL_REQUIRED", () => {
    expect(mapOfferActionError({ message: "OFFER_POLICY_REQUIRED" })).toEqual({
      status: 409,
      code: "APPROVAL_REQUIRED",
      message: "Owner approval required",
      details: { action: "offer.accept" }
    });
  });

  it("maps a mission hard-budget block to a stable approval result", () => {
    expect(
      mapOfferActionError({ message: "MISSION_APPROVAL_REQUIRED:HARD_BUDGET_EXCEEDED" })
    ).toEqual({
      status: 409,
      code: "APPROVAL_REQUIRED",
      message: "Owner approval required",
      details: { action: "offer.accept", reason: "hard_budget_exceeded" }
    });
  });

  it("maps OFFER_NOT_ACTIONABLE:<STATUS> to 409 with details", () => {
    const mapped = mapOfferActionError({ message: "OFFER_NOT_ACTIONABLE:ACCEPTED" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("OFFER_NOT_ACTIONABLE");
    expect(mapped.details).toEqual({ status: "ACCEPTED" });
  });
});
