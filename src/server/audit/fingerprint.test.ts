import { describe, expect, it } from "vitest";

import { createHmacFingerprint, stableStringify } from "./fingerprint";

describe("stableStringify", () => {

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
});

