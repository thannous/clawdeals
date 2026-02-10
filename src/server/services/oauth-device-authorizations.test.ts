import { describe, expect, it } from "vitest";

import { normalizeOauthUserCode } from "./oauth-device-authorizations";

describe("normalizeOauthUserCode", () => {
  it("returns null for empty values", () => {
    expect(normalizeOauthUserCode(null)).toBeNull();
    expect(normalizeOauthUserCode(undefined)).toBeNull();
    expect(normalizeOauthUserCode("")).toBeNull();
    expect(normalizeOauthUserCode("   ")).toBeNull();
  });

  it("canonicalizes case and separators", () => {
    expect(normalizeOauthUserCode("abcd-efgh")).toBe("ABCD-EFGH");
    expect(normalizeOauthUserCode("abcd efgh")).toBe("ABCD-EFGH");
    expect(normalizeOauthUserCode("ABCD_EFGH")).toBe("ABCD-EFGH");
    expect(normalizeOauthUserCode("  AbCd.EfGh  ")).toBe("ABCD-EFGH");
  });

  it("rejects invalid length", () => {
    expect(normalizeOauthUserCode("ABC")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EFG")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EFGHI")).toBeNull();
  });

  it("rejects ambiguous characters (I/O/1/0)", () => {
    expect(normalizeOauthUserCode("ABCI-EFGH")).toBeNull();
    expect(normalizeOauthUserCode("ABCO-EFGH")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EF1H")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EF0H")).toBeNull();
  });

  it("accepts digits 2-9", () => {
    expect(normalizeOauthUserCode("23456789")).toBe("2345-6789");
  });
});

