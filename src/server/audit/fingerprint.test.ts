import { describe, expect, it } from "vitest";

import { createHmacFingerprint, stableStringify } from "./fingerprint";

describe("stableStringify", () => {
  it("sorts object keys recursively and normalizes undefined to null", () => {
    const input: any = {
      b: 1,
      a: undefined,
      nested: { z: 1, y: 2 }
    };

    expect(stableStringify(input)).toBe("{\"a\":null,\"b\":1,\"nested\":{\"y\":2,\"z\":1}}");
  });

  it("normalizes Date instances to ISO strings", () => {
    const input = { ts: new Date("2026-02-09T01:02:03.000Z") };
    expect(stableStringify(input)).toBe("{\"ts\":\"2026-02-09T01:02:03.000Z\"}");
  });

  it("replaces circular references with [Circular]", () => {
    const input: any = { a: 1 };
    input.self = input;
    expect(stableStringify(input)).toBe("{\"a\":1,\"self\":\"[Circular]\"}");
  });
});

describe("createHmacFingerprint", () => {
  it("produces the same digest regardless of key order", () => {
    const secret = "secret-1";
    const digest1 = createHmacFingerprint({ secret, data: { b: 1, a: 2 } });
    const digest2 = createHmacFingerprint({ secret, data: { a: 2, b: 1 } });
    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws when secret is missing", () => {
    expect(() => createHmacFingerprint({ data: { a: 1 } })).toThrow(/secret/i);
  });
});

