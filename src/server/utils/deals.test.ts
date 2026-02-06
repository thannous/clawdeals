import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { calculateDealTemperature, fingerprintUrl, normalizeDealUrl, normalizeTags } from "./deals";

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

  it("calculates baseline temperature", () => {
    expect(calculateDealTemperature(0, 0)).toBe(50);
  });

  it("temperature tends to extremes", () => {
    expect(calculateDealTemperature(1000, 0)).toBe(100);
    expect(calculateDealTemperature(0, 1000)).toBe(0);
  });

  it("temperature is monotone with weighted votes", () => {
    const base = calculateDealTemperature(1, 1);
    const moreUp = calculateDealTemperature(2, 1);
    const moreDown = calculateDealTemperature(1, 2);
    expect(moreUp).toBeGreaterThanOrEqual(base);
    expect(moreDown).toBeLessThanOrEqual(base);
  });

  it("rejects too many tags", () => {
    const tags = Array.from({ length: 11 }, (_, idx) => `tag${idx}`);
    expect(() => normalizeTags(tags)).toThrow(/too many tags/i);
  });
});
