import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { generateOwnerSessionToken, hashOwnerSessionToken, isOwnerSessionToken } from "./session-tokens";

describe("session-tokens", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OWNER_SESSION_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("generates owner session tokens with prefix", () => {
    const token = generateOwnerSessionToken();
    expect(token.startsWith("cd_os_")).toBe(true);
    expect(isOwnerSessionToken(token)).toBe(true);
  });

  it("hashes owner session tokens deterministically", () => {
    const token = "cd_os_test_token";
    const hash1 = hashOwnerSessionToken(token);
    const hash2 = hashOwnerSessionToken(token);
    expect(hash1).toBe(hash2);
  });
});
