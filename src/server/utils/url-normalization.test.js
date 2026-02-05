import { describe, expect, it } from "vitest";
import { normalizeUrl, fingerprintUrl } from "./url-normalization";

describe("url normalization", () => {
  it("lowercases scheme/host and removes fragment", () => {
    const normalized = normalizeUrl("HTTPS://Example.COM/Path#Section");
    expect(normalized).toBe("https://example.com/Path");
  });

  it("strips trailing slash except root", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("removes tracking params and sorts remaining query", () => {
    const normalized = normalizeUrl(
      "https://example.com/p?b=2&utm_source=x&a=1&a=0&gclid=abc"
    );
    expect(normalized).toBe("https://example.com/p?a=0&a=1&b=2");
  });

  it("produces stable fingerprint for equivalent URLs", () => {
    const first = fingerprintUrl(normalizeUrl("https://example.com/p?a=1&utm_source=x"));
    const second = fingerprintUrl(normalizeUrl("https://example.com/p?a=1"));
    expect(first).toBe(second);
  });

  it("rejects non-http(s) URLs", () => {
    expect(normalizeUrl("ftp://example.com/file")).toBeNull();
  });
});
