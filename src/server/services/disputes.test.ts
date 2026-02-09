import { describe, expect, it } from "vitest";

import { mapDisputeRpcError } from "./disputes";

describe("disputes service error mapping", () => {
  it("maps DISPUTE_ALREADY_EXISTS to 409", () => {
    expect(mapDisputeRpcError({ message: "DISPUTE_ALREADY_EXISTS" })).toMatchObject({
      status: 409,
      code: "DISPUTE_ALREADY_EXISTS"
    });
  });

  it("maps DISPUTE_NOT_FOUND to 404", () => {
    expect(mapDisputeRpcError({ message: "DISPUTE_NOT_FOUND" })).toMatchObject({
      status: 404,
      code: "DISPUTE_NOT_FOUND"
    });
  });

  it("maps INVALID_STATE:<STATUS> to 409 with details", () => {
    expect(mapDisputeRpcError({ message: "INVALID_STATE:CREATED" })).toMatchObject({
      status: 409,
      code: "INVALID_STATE",
      details: { status: "CREATED" }
    });
  });
});

