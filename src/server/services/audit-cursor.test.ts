import { describe, expect, it } from "vitest";

import { decodeAuditCursor, encodeAuditCursor } from "./audit-cursor";

describe("audit cursor", () => {
  it("encodes and decodes a valid cursor", () => {
    const input = {
      occurred_at: "2026-02-07T14:30:00Z",
      id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    };
    const encoded = encodeAuditCursor(input);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = decodeAuditCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("returns null for null input", () => {
    expect(decodeAuditCursor(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(decodeAuditCursor(undefined)).toBeNull();
  });

  it("returns error for invalid base64", () => {
    const decoded = decodeAuditCursor("not-base64!!!");
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("returns error for invalid JSON", () => {
    const raw = Buffer.from("not json at all").toString("base64");
    const decoded = decodeAuditCursor(raw);
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("returns error when occurred_at is missing", () => {
    const encoded = encodeAuditCursor({ id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4" });
    const decoded = decodeAuditCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("returns error when occurred_at is not a string", () => {
    const encoded = encodeAuditCursor({
      occurred_at: 12345,
      id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    });
    const decoded = decodeAuditCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("returns error when id is missing", () => {
    const encoded = encodeAuditCursor({ occurred_at: "2026-02-07T14:30:00Z" });
    const decoded = decodeAuditCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("returns error when id is not a UUID", () => {
    const encoded = encodeAuditCursor({
      occurred_at: "2026-02-07T14:30:00Z",
      id: "not-a-uuid"
    });
    const decoded = decodeAuditCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });
});
