import { describe, expect, it } from "vitest";

import { decodeWatchlistCursor, encodeWatchlistCursor } from "./watchlists";

describe("watchlists cursor", () => {
  it("encodes and decodes cursor (base64url)", () => {
    const input = {
      created_at: "2026-02-05T12:00:00Z",
      watchlist_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeWatchlistCursor(input);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = decodeWatchlistCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("decodes legacy base64 (including '+' -> space normalization)", () => {
    const input = {
      created_at: "2026-02-05T12:00:00Z",
      watchlist_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const legacy = Buffer.from(JSON.stringify(input), "utf8").toString("base64");
    expect(decodeWatchlistCursor(legacy)?.value).toEqual(input);

    // Simulate querystring '+' decoded as space.
    const legacyWithSpaces = legacy.replace(/\+/g, " ");
    expect(decodeWatchlistCursor(legacyWithSpaces)?.value).toEqual(input);
  });

  it("rejects invalid cursor payload", () => {
    const decoded = decodeWatchlistCursor("not-base64");
    expect(decoded?.error).toBe("Invalid cursor");
  });
});

