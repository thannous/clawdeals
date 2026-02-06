import { describe, expect, it } from "vitest";
import { buildRequestHmac, decryptJson, encryptJson } from "./crypto";

describe("idempotency crypto", () => {
  it("builds a stable request hmac", () => {
    const hmac = buildRequestHmac({
      secret: "test-secret",
      method: "POST",
      path: "/v1/deals",
      query: "a=1&b=2",
      canonicalBody: "{}"
    });
    expect(hmac).toMatch(/^[a-f0-9]{64}$/);
  });

  it("encrypts and decrypts payloads", () => {
    const payload = { token: "abc" };
    const encrypted = encryptJson({ secret: "secret", payload });
    const decrypted = decryptJson({ secret: "secret", payload: encrypted });
    expect(decrypted).toEqual(payload);
  });
});
