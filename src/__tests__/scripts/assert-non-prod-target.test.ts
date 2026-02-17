import { describe, expect, it } from "vitest";

import {
  assertNonProdFromEnv,
  assertNonProdTarget,
  extractSupabaseRef,
  isProductionApiTarget,
  isProductionSupabaseTarget
} from "../../../scripts/lib/assert-non-prod-target.mjs";

describe("assert-non-prod-target", () => {
  it("extracts supabase ref from db and project hosts", () => {
    expect(extractSupabaseRef("https://gztfmpuqtpvncdcuhqxy.supabase.co")).toBe("gztfmpuqtpvncdcuhqxy");
    expect(extractSupabaseRef("https://db.gztfmpuqtpvncdcuhqxy.supabase.co")).toBe("gztfmpuqtpvncdcuhqxy");
    expect(extractSupabaseRef("https://db.usuyppgsmmowzizhaoqj.supabase.co")).toBe("usuyppgsmmowzizhaoqj");
  });

  it("detects production supabase target", () => {
    expect(isProductionSupabaseTarget("https://db.gztfmpuqtpvncdcuhqxy.supabase.co")).toBe(true);
    expect(isProductionSupabaseTarget("https://db.usuyppgsmmowzizhaoqj.supabase.co")).toBe(false);
  });

  it("detects production api host", () => {
    expect(isProductionApiTarget("https://app.clawdeals.com")).toBe(true);
    expect(isProductionApiTarget("http://localhost:3000")).toBe(false);
  });

  it("throws a clear error for production supabase env", () => {
    expect(() =>
      assertNonProdFromEnv(
        {
          SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co",
          API_BASE_URL: "https://staging.app.clawdeals.com"
        },
        { context: "integration tests" }
      )
    ).toThrowError(/Refusing to run integration tests against production/i);
  });

  it("throws a clear error for production api target", () => {
    expect(() =>
      assertNonProdTarget({
        context: "Playwright tests",
        supabaseTargets: [{ label: "SUPABASE_URL", value: "https://db.usuyppgsmmowzizhaoqj.supabase.co" }],
        apiTargets: [{ label: "E2E_BASE_URL", value: "https://app.clawdeals.com" }]
      })
    ).toThrowError(/Production API target/);
  });

  it("allows local and staging targets", () => {
    expect(() =>
      assertNonProdFromEnv(
        {
          SUPABASE_URL: "https://db.usuyppgsmmowzizhaoqj.supabase.co",
          API_BASE_URL: "https://staging.app.clawdeals.com",
          E2E_BASE_URL: "http://localhost:3000"
        },
        { context: "smoke tests" }
      )
    ).not.toThrow();
  });
});
