import { describe, expect, it } from "vitest";

import { decodeWatchlistMatchesCursor, encodeWatchlistMatchesCursor } from "./watchlist-matches";

describe("watchlist matches cursor", () => {
  it("encodes and decodes cursor (base64url)", () => {
    const input = {
      matched_at: "2026-02-05T12:00:00Z",
      watchlist_match_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeWatchlistMatchesCursor(input);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = decodeWatchlistMatchesCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("decodes legacy base64 (including '+' -> space normalization)", () => {
    const input = {
      matched_at: "2026-02-05T12:00:00Z",
      watchlist_match_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const legacy = Buffer.from(JSON.stringify(input), "utf8").toString("base64");
    expect(decodeWatchlistMatchesCursor(legacy)?.value).toEqual(input);

    // Simulate querystring '+' decoded as space.
    const legacyWithSpaces = legacy.replace(/\+/g, " ");
    expect(decodeWatchlistMatchesCursor(legacyWithSpaces)?.value).toEqual(input);
  });

  it("rejects invalid cursor payload", () => {
    const decoded = decodeWatchlistMatchesCursor("not-base64");
    expect(decoded?.error).toBe("Invalid cursor");
  });
});

