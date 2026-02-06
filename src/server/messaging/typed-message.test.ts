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
