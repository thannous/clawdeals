import { describe, expect, it } from "vitest";
import { redactValue } from "./redaction";

describe("redactValue", () => {
  it("redacts known sensitive keys", () => {
    const input = { authorization: "Bearer secret", nested: { api_key: "123", api_key_id: "id-123" } };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.authorization).toBe("[REDACTED]");
    expect(value.nested.api_key).toBe("[REDACTED]");
    // IDs are not secrets; keep them for auditing.
    expect(value.nested.api_key_id).toBe("id-123");
  });

  it("redacts email, phone, phone_e164, token, otp, code, pin", () => {
    const input = {
      email: "user@example.com",
      phone: "+33600000000",
      phone_e164: "+33600000000",
      token: "abc123",
      otp: "123456",
      code: "654321",
      pin: "0000"
    };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.email).toBe("[REDACTED]");
    expect(value.phone).toBe("[REDACTED]");
    expect(value.phone_e164).toBe("[REDACTED]");
    expect(value.token).toBe("[REDACTED]");
    expect(value.otp).toBe("[REDACTED]");
    expect(value.code).toBe("[REDACTED]");
    expect(value.pin).toBe("[REDACTED]");
  });

  it("redacts nested objects and arrays", () => {
    const input = {
      users: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", token: "secret-token" }
      ],
      deep: { level1: { level2: { api_key: "key-123" } } }
    };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.users[0].email).toBe("[REDACTED]");
    expect(value.users[0].name).toBe("Alice");
    expect(value.users[1].token).toBe("[REDACTED]");
    expect(value.deep.level1.level2.api_key).toBe("[REDACTED]");
  });

  it("returns redacted=false when no sensitive key present", () => {
    const input = { name: "Alice", age: 30, city: "Paris" };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(false);
    expect(value.name).toBe("Alice");
    expect(value.age).toBe(30);
  });

  it("handles null and undefined values", () => {
    const resultNull = redactValue(null);
    expect(resultNull.value).toBeNull();
    expect(resultNull.redacted).toBe(false);

    const resultUndefined = redactValue(undefined);
    expect(resultUndefined.value).toBeUndefined();
    expect(resultUndefined.redacted).toBe(false);
  });

  it("handles empty objects", () => {
    const { value, redacted } = redactValue({});
    expect(redacted).toBe(false);
    expect(value).toEqual({});
  });
});
