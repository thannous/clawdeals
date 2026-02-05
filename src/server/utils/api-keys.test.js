import { describe, expect, it } from "vitest";
import { generateApiKey, parseApiKey, hashApiKeySecret, verifyApiKeySecret } from "./api-keys";

describe("api key utils", () => {
  it("generates and parses api keys", () => {
    const { apiKey, prefix, secret } = generateApiKey();
    expect(apiKey).toContain(".");
    const parsed = parseApiKey(apiKey);
    expect(parsed).not.toBeNull();
    expect(parsed.prefix).toBe(prefix);
    expect(parsed.secret).toBe(secret);
  });

  it("hashes and verifies secrets", async () => {
    const secret = "supersecret";
    const hash = await hashApiKeySecret(secret);
    const match = await verifyApiKeySecret(secret, hash);
    expect(match).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(parseApiKey("")) .toBeNull();
    expect(parseApiKey("badformat")) .toBeNull();
    expect(parseApiKey("cd_live_onlyprefix")) .toBeNull();
  });
});
