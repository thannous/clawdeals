import { describe, expect, it } from "vitest";

import { decodeDealsCursor, encodeDealsCursor } from "./deals-cursor";

describe("deals cursor", () => {
  it("encodes and decodes new cursor", () => {
    const input = {
      sort: "new",
      status: "NEW",
      created_at: "2026-02-05T12:00:00Z",
      deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeDealsCursor(input);
    const decoded = decodeDealsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("encodes and decodes temp cursor", () => {
    const input = {
      sort: "temp",
      temperature: 82,
      created_at: "2026-02-05T12:00:00Z",
      deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeDealsCursor(input);
    const decoded = decodeDealsCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("encodes and decodes trend cursor", () => {
    const input = {
      sort: "trend",
      as_of: "2026-02-05T12:30:00Z",
      trend_score: "79.123456",
      created_at: "2026-02-05T11:59:00Z",
      deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeDealsCursor(input);
    const decoded = decodeDealsCursor(encoded);
    expect(decoded?.value).toEqual({ ...input, active_at: null });
  });

  it("decodes legacy trend cursor with active_at", () => {
    const legacy = {
      sort: "trend",
      as_of: "2026-02-05T12:30:00Z",
      trend_score: "79.123456",
      active_at: "2026-02-05T12:00:00Z",
      created_at: "2026-02-05T11:59:00Z",
      deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeDealsCursor(legacy);
    const decoded = decodeDealsCursor(encoded);
    expect(decoded?.value).toEqual(legacy);
  });

  it("rejects invalid cursor payload", () => {
    const decoded = decodeDealsCursor("not-base64");
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("rejects cursor with wrong shape", () => {
    const encoded = encodeDealsCursor({ sort: "new" });
    const decoded = decodeDealsCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });
});
