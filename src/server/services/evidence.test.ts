import { describe, expect, it } from "vitest";

import { isAllowedEvidenceContentType, isValidSha256Hex } from "./evidence";

describe("evidence helpers (TI-214)", () => {
  it("validates sha256 hex strings", () => {
    expect(isValidSha256Hex("a".repeat(64))).toBe(true);
    expect(isValidSha256Hex("A".repeat(64))).toBe(true);

    expect(isValidSha256Hex("a".repeat(63))).toBe(false);
    expect(isValidSha256Hex("a".repeat(65))).toBe(false);
    expect(isValidSha256Hex("g".repeat(64))).toBe(false);
    expect(isValidSha256Hex(null)).toBe(false);
  });

  it("enforces content-type allowlist", () => {
    expect(isAllowedEvidenceContentType("image/jpeg")).toBe(true);
    expect(isAllowedEvidenceContentType("image/png")).toBe(true);
    expect(isAllowedEvidenceContentType("image/webp")).toBe(true);
    expect(isAllowedEvidenceContentType("application/pdf")).toBe(true);

    // Case-insensitive.
    expect(isAllowedEvidenceContentType("Image/PNG")).toBe(true);

    expect(isAllowedEvidenceContentType("text/plain")).toBe(false);
    expect(isAllowedEvidenceContentType("application/zip")).toBe(false);
    expect(isAllowedEvidenceContentType(null)).toBe(false);
  });
});

