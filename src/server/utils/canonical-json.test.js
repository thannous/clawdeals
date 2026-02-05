import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "./canonical-json";

describe("canonicalJsonStringify", () => {
  it("sorts object keys deterministically", () => {
    const value = { b: 2, a: 1, c: { z: 1, y: 2 } };
    expect(canonicalJsonStringify(value)).toBe('{"a":1,"b":2,"c":{"y":2,"z":1}}');
  });

  it("handles arrays", () => {
    const value = { list: [3, { b: 2, a: 1 }] };
    expect(canonicalJsonStringify(value)).toBe('{"list":[3,{"a":1,"b":2}]}');
  });
});
