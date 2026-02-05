import { describe, expect, it } from "vitest";
import { redactValue } from "./redaction";

describe("redactValue", () => {
  it("redacts known sensitive keys", () => {
    const input = { authorization: "Bearer secret", nested: { api_key: "123" } };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.authorization).toBe("[REDACTED]");
    expect(value.nested.api_key).toBe("[REDACTED]");
  });
});
