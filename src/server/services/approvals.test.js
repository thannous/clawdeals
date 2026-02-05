import { describe, expect, it } from "vitest";
import { decodeApprovalCursor, encodeApprovalCursor } from "./approvals";

describe("approvals cursor", () => {
  it("encodes and decodes cursor", () => {
    const input = { created_at: "2026-02-05T10:00:00Z", approval_id: "uuid-1" };
    const encoded = encodeApprovalCursor(input);
    const decoded = decodeApprovalCursor(encoded);
    expect(decoded?.value).toEqual(input);
  });

  it("rejects invalid cursor", () => {
    const decoded = decodeApprovalCursor("not-base64");
    expect(decoded?.error).toBe("Invalid cursor");
  });

  it("rejects malformed cursor payload", () => {
    const encoded = Buffer.from("not-json", "utf8").toString("base64");
    const decoded = decodeApprovalCursor(encoded);
    expect(decoded?.error).toBe("Invalid cursor");
  });
});
