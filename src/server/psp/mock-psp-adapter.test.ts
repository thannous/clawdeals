import { describe, expect, it } from "vitest";

import { MockPspAdapter } from "./mock-psp-adapter";
import { hmacSha256 } from "../utils/hmac";

describe("MockPspAdapter", () => {
  it("verifies webhook signature", () => {
    const adapter = new MockPspAdapter({ mode: "sandbox" });
    const canonicalBody = "{\"a\":1}";
    const secret = "secret";
    const signature = hmacSha256(secret, canonicalBody);

    expect(
      adapter.verifyWebhookSignature({
        canonicalBody,
        headers: { "x-psp-signature": signature },
        secret
      })
    ).toEqual({ ok: true });
  });

  it("rejects missing or invalid webhook signature", () => {
    const adapter = new MockPspAdapter({ mode: "sandbox" });
    const canonicalBody = "{\"a\":1}";
    const secret = "secret";

    expect(
      adapter.verifyWebhookSignature({
        canonicalBody,
        headers: {},
        secret
      })
    ).toEqual({ ok: false, error: "missing_signature" });

    expect(
      adapter.verifyWebhookSignature({
        canonicalBody,
        headers: { "x-psp-signature": "bad" },
        secret
      })
    ).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("parses webhook events and coerces missing id/created_at", () => {
    const adapter = new MockPspAdapter({ mode: "sandbox" });

    const event = adapter.parseWebhookEvent({
      type: "payment.succeeded",
      data: { payment_id: "pay_123" }
    });

    expect(event.type).toBe("payment.succeeded");
    if (event.type !== "payment.succeeded") {
      throw new Error("Expected payment.succeeded");
    }
    expect(typeof event.id).toBe("string");
    expect(event.id.length).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(event.created_at))).toBe(true);
    expect(event.data.payment_id).toBe("pay_123");
  });

  it("throws when type is missing", () => {
    const adapter = new MockPspAdapter({ mode: "sandbox" });
    expect(() => adapter.parseWebhookEvent({ id: "evt_1" })).toThrow(/type is required/i);
  });
});
