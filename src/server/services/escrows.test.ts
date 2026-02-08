import { describe, expect, it } from "vitest";

import { mapEscrowRpcError } from "./escrows";

describe("mapEscrowRpcError (TI-211)", () => {
  it("maps TX_NOT_FOUND to 404", () => {
    const mapped = mapEscrowRpcError({ message: "TX_NOT_FOUND" });
    expect(mapped.status).toBe(404);
    expect(mapped.code).toBe("TX_NOT_FOUND");
  });

  it("maps TX_NOT_READY:<STATUS> to 409 with details", () => {
    const mapped = mapEscrowRpcError({ message: "TX_NOT_READY:ACCEPTED" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("TX_NOT_READY");
    expect(mapped.details).toEqual({ status: "ACCEPTED" });
  });

  it("maps ESCROW_ALREADY_EXISTS to 409", () => {
    const mapped = mapEscrowRpcError({ message: "ESCROW_ALREADY_EXISTS" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("ESCROW_ALREADY_EXISTS");
  });

  it("maps INVALID_STATE:<STATUS> to 409 with details", () => {
    const mapped = mapEscrowRpcError({ message: "INVALID_STATE:HOLD" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("INVALID_STATE");
    expect(mapped.details).toEqual({ status: "HOLD" });
  });

  it("maps ESCROW_FINALIZED to 409", () => {
    const mapped = mapEscrowRpcError({ message: "ESCROW_FINALIZED" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("ESCROW_FINALIZED");
  });
});

