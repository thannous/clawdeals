import { describe, expect, it, beforeEach } from "vitest";

import { computeMessageBodyHmac, redactMessageText, getPaymentKeywordsFromEnv } from "./redaction";

describe("messaging/redaction", () => {
  beforeEach(() => {
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
    delete process.env.MESSAGE_REDACTION_PAYMENT_KEYWORDS;
  });

  it("redacts http/https urls", () => {
    const result = redactMessageText("Visit https://scam.com for payment");
    expect(result.redacted).toBe(true);
    expect(result.reasons).toContain("external_link");
    expect(result.text).toBe("Visit [redacted] for payment");
  });

  it("redacts www. urls", () => {
    const result = redactMessageText("Check www.paypal.com");
    expect(result.redacted).toBe(true);
    expect(result.reasons).toContain("external_link");
    expect(result.text).toBe("Check [redacted]");
  });

  it("redacts email addresses", () => {
    const result = redactMessageText("Email me at scam@example.com");
    expect(result.redacted).toBe(true);
    expect(result.reasons).toContain("external_link");
    expect(result.text).toBe("Email me at [redacted]");
  });

  it("redacts bare domains with tld", () => {
    const result = redactMessageText("Check example.com/pay");
    expect(result.redacted).toBe(true);
    expect(result.reasons).toContain("external_link");
    expect(result.text).toBe("Check [redacted]");
  });

  it("redacts payment keywords case-insensitively", () => {
    const result = redactMessageText("Send via PayPal or Bitcoin");
    expect(result.redacted).toBe(true);
    expect(result.reasons).toContain("payment_keyword");
    expect(result.text).toBe("Send via [redacted] or [redacted]");
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

  it("computes hmac for auditing without storing plaintext", () => {
    const hmac = computeMessageBodyHmac("hello");
    expect(hmac).toMatch(/^[0-9a-f]{64}$/i);
    expect(hmac).toBe(computeMessageBodyHmac("hello"));
    expect(hmac).not.toBe(computeMessageBodyHmac("hello!"));
  });
});
