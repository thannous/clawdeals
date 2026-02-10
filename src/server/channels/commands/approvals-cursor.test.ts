import { describe, expect, it } from "vitest";

import { decodeApprovalsCursorToken, encodeApprovalsCursorToken } from "./approvals-cursor";

const UUID = "00000000-0000-4000-a000-000000000123";

describe("approvals-cursor", () => {
  it("encodes and decodes a compact cursor token", () => {
    const createdAt = "2026-02-10T12:34:56.789123Z";
    const token = encodeApprovalsCursorToken({ createdAt, approvalId: UUID });
    expect(typeof token).toBe("string");
    expect(token!.length).toBeLessThanOrEqual(64);

    const decoded = decodeApprovalsCursorToken(token);
    expect(decoded).toEqual({
      value: {
        created_at: createdAt,
        approval_id: UUID
      }
    });
  });

  it("returns null on empty input", () => {
    expect(encodeApprovalsCursorToken({ createdAt: "" as any, approvalId: UUID })).toBeNull();
    expect(decodeApprovalsCursorToken("")).toBeNull();
    expect(decodeApprovalsCursorToken(null)).toBeNull();
    expect(decodeApprovalsCursorToken(undefined)).toBeNull();
  });

  it("returns { error } on invalid token", () => {
    expect(decodeApprovalsCursorToken("nope")).toEqual({ error: "Invalid cursor" });
    expect(decodeApprovalsCursorToken("abc.def")).toEqual({ error: "Invalid cursor" });
    expect(decodeApprovalsCursorToken("zzzzzzzz.0000")).toEqual({ error: "Invalid cursor" });
  });
});
