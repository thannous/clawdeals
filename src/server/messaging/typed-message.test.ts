import { describe, expect, it } from "vitest";

import { isTypedMessageParseError, parseTypedMessage } from "./typed-message";

describe("parseTypedMessage", () => {

  it("rejects too long question text with TEXT_TOO_LONG", () => {
    const result = parseTypedMessage({ type: "question", text: "a".repeat(801) });
    expect(result.ok).toBe(false);
    if (!isTypedMessageParseError(result)) return;
    expect(result.error.code).toBe("TEXT_TOO_LONG");
  });

  it("strips control characters from text", () => {
    const result = parseTypedMessage({ type: "info", text: "Hello\u0000World" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload).toEqual({ type: "info", text: "HelloWorld" });
  });
});
