import { describe, expect, it } from "vitest";

import { capToolOutputBytes } from "./output-cap";

describe("capToolOutputBytes", () => {
  it("returns small values unchanged", () => {
    const input = { items: ["one", "two"] };

    expect(capToolOutputBytes(input, { maxBytes: 100 })).toEqual({
      value: input,
      truncated: false,
      maxBytes: 100
    });
  });

  it("truncates a top-level array to twenty items when that fits", () => {
    const input = Array.from({ length: 30 }, (_, index) => index);
    const result = capToolOutputBytes(input, { maxBytes: 55 });

    expect(result.truncated).toBe(true);
    expect(result.value).toEqual(input.slice(0, 20));
  });

  it.each(["items", "approvals", "data"])("truncates the %s collection of an object", (key) => {
    const input = { [key]: Array.from({ length: 30 }, (_, index) => index) };
    const result = capToolOutputBytes(input, { maxBytes: 70 });

    expect(result.truncated).toBe(true);
    expect((result.value as any)[key]).toHaveLength(20);
  });

  it("falls back to a minimal payload when truncation is still too large", () => {
    const result = capToolOutputBytes(
      { items: Array.from({ length: 30 }, () => "x".repeat(100)), extra: "y".repeat(500) },
      { maxBytes: 80 }
    );

    expect(result).toEqual({
      value: {
        truncated: true,
        message: "Tool output exceeded max size and was truncated"
      },
      truncated: true,
      maxBytes: 80
    });
  });

  it("measures multibyte strings as UTF-8 bytes", () => {
    const result = capToolOutputBytes("😀😀", { maxBytes: 7 });

    expect(result.truncated).toBe(true);
  });
});
