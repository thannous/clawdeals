import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { fingerprintUrl, normalizeDealUrl, normalizeTags } from "./deals";

describe("deal utils", () => {
  it("normalizes URL by removing tracking params and fragment", () => {
    const input = "HTTPS://Example.COM/deals/?utm_source=x&b=2&a=1#frag";
    const normalized = normalizeDealUrl(input);
    expect(normalized).toBe("https://example.com/deals?a=1&b=2");
  });

  it("preserves root slash", () => {
    const normalized = normalizeDealUrl("https://Example.com/");
    expect(normalized).toBe("https://example.com/");
  });

  it("fingerprints normalized URL", () => {
    const input = "https://example.com/deals?a=1";
    const expected = crypto.createHash("sha256").update(input).digest("hex");
    expect(fingerprintUrl(input)).toBe(expected);
  });

  it("normalizes tags", () => {
    const result = normalizeTags([" GPU ", "nvidia", "GPU"]);
    expect(result).toEqual(["gpu", "nvidia"]);
  });

  it("rejects too many tags", () => {
    const tags = Array.from({ length: 11 }, (_, idx) => `tag${idx}`);
    expect(() => normalizeTags(tags)).toThrow(/too many tags/i);
  });
});
