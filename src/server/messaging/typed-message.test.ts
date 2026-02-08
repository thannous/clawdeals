import { describe, expect, it } from "vitest";

import { isTypedMessageParseError, parseTypedMessage } from "./typed-message";

describe("parseTypedMessage", () => {
  it("accepts a valid question", () => {
    const result = parseTypedMessage({ type: "question", text: "Is it still available?" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("question");
    expect(result.value.payload).toEqual({ type: "question", text: "Is it still available?" });
  });

  it("rejects unknown type", () => {
    const result = parseTypedMessage({ type: "freeform", text: "hi" });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("rejects missing required fields", () => {
    const result = parseTypedMessage({ type: "question" });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("rejects too long question text with TEXT_TOO_LONG", () => {
    const result = parseTypedMessage({ type: "question", text: "a".repeat(801) });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("TEXT_TOO_LONG");
  });

  it("rejects invalid offer_id", () => {
    const result = parseTypedMessage({ type: "offer", offer_id: "not-a-uuid" });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("accepts a valid counter_offer", () => {
    const result = parseTypedMessage({
      type: "counter_offer",
      offer_id: "11111111-1111-4111-8111-111111111111",
      previous_offer_id: "22222222-2222-4222-8222-222222222222"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("counter_offer");
    expect(result.value.payload).toEqual({
      type: "counter_offer",
      offer_id: "11111111-1111-4111-8111-111111111111",
      previous_offer_id: "22222222-2222-4222-8222-222222222222"
    });
  });

  it("rejects counter_offer missing previous_offer_id", () => {
    const result = parseTypedMessage({
      type: "counter_offer",
      offer_id: "11111111-1111-4111-8111-111111111111"
    });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("rejects warning messages by default", () => {
    const result = parseTypedMessage({ type: "warning", code: "x", text: "nope" });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });

  it("strips control characters from text", () => {
    const result = parseTypedMessage({ type: "info", text: "Hello\u0000World" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload).toEqual({ type: "info", text: "HelloWorld" });
  });
});
