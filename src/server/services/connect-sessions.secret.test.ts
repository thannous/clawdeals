import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashConnectSessionClaimToken } from "./connect-sessions";

describe("connect-sessions secret resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CONNECT_SESSION_SECRET;
    delete process.env.CONNECT_SESSIONS_SECRET;
    delete process.env.OWNER_SESSION_SECRET;
    delete process.env.OWNER_SESSIONS_SECRET;
    delete process.env.OAUTH_TOKEN_SECRET;
    delete process.env.OAUTH_DEVICE_SECRET;
    delete process.env.PAIR_TOKEN_SECRET;
    delete process.env.PAIRING_CODE_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses OWNER_SESSION_SECRET as fallback for connect session hashing", () => {
    process.env.OWNER_SESSION_SECRET = "owner-secret";

    const hash = hashConnectSessionClaimToken("cd_claim_test");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("throws MISSING_SECRET when no supported secret is configured", () => {
    try {
      hashConnectSessionClaimToken("cd_claim_test");
      throw new Error("Expected hashConnectSessionClaimToken to throw");
    } catch (error: any) {
      expect(error.code).toBe("MISSING_SECRET");
      expect(error.message).toContain("CONNECT_SESSION_SECRET");
    }
  });
});
