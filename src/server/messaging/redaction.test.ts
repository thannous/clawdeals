import { describe, expect, it, beforeEach } from "vitest";

import { redactMessageText, getPaymentKeywordsFromEnv } from "./redaction";

describe("messaging/redaction", () => {
  beforeEach(() => {
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
    delete process.env.MESSAGE_REDACTION_PAYMENT_KEYWORDS;
  });

  it("supports configurable keyword list via env csv", () => {
    process.env.MESSAGE_REDACTION_PAYMENT_KEYWORDS = "foo,bar baz";
    const keywords = getPaymentKeywordsFromEnv(process.env);
    expect(keywords).toEqual(["foo", "bar baz"]);

    const result = redactMessageText("pay with foo or bar   baz", { env: process.env });
    expect(result.redacted).toBe(true);
    expect(result.reasons).toContain("payment_keyword");
    expect(result.text).toBe("pay with [redacted] or [redacted]");
  });
});
