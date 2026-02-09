import { describe, expect, it } from "vitest";

import { decodeListingsCursor, encodeListingsCursor } from "./listings-cursor";

describe("listings cursor", () => {
  it("encodes and decodes recent cursor", () => {
    const input = {
      sort: "recent",
      created_at: "2026-02-05T12:00:00Z",
      listing_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeListingsCursor(input);
    const decoded = decodeListingsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("encodes and decodes rank cursor", () => {
    const input = {
      sort: "rank",
      as_of: "2026-02-09T12:00:00Z",
      rank_score: "123.456",
      created_at: "2026-02-09T11:59:00Z",
      listing_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeListingsCursor(input);
    const decoded = decodeListingsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("rejects invalid cursor", () => {
    const decoded = decodeListingsCursor("not-base64");
    expect(decoded?.error).toBe("Invalid cursor");
  });
});

