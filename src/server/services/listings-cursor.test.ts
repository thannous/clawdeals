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
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = decodeListingsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("encodes and decodes price_asc cursor", () => {
    const input = {
      sort: "price_asc",
      price_amount: 12345,
      listing_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeListingsCursor(input);
    const decoded = decodeListingsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("encodes and decodes price_desc cursor", () => {
    const input = {
      sort: "price_desc",
      price_amount: 12345,
      listing_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeListingsCursor(input);
    const decoded = decodeListingsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("rejects invalid cursor payload", () => {
    const decoded = decodeListingsCursor("not-base64");
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("rejects cursor with wrong shape", () => {
    const encoded = encodeListingsCursor({ sort: "recent" });
    const decoded = decodeListingsCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });
});
