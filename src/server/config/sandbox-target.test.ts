import { afterEach, describe, expect, it } from "vitest";

import { assertSandboxNotProductionTarget } from "./sandbox-target";

const SANDBOX_URL_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const STAGING_SUPABASE_URL = "https://usuyppgsmmowzizhaoqj.supabase.co";
const PRODUCTION_SUPABASE_URL = "https://gztfmpuqtpvncdcuhqxy.supabase.co";

describe("assertSandboxNotProductionTarget", () => {
  const prevEnv = process.env.CLAWDEALS_ENV;
  const prevSupabaseUrls = Object.fromEntries(
    SANDBOX_URL_KEYS.map((key) => [key, process.env[key]])
  );

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.CLAWDEALS_ENV;
    } else {
      process.env.CLAWDEALS_ENV = prevEnv;
    }
    for (const key of SANDBOX_URL_KEYS) {
      if (prevSupabaseUrls[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prevSupabaseUrls[key];
      }
    }
  });

  it("is fail-closed when sandbox env is missing either Supabase URL", () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    process.env.SUPABASE_URL = STAGING_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => assertSandboxNotProductionTarget()).toThrowError(/explicit non-production Supabase URL/i);
  });

  it("rejects sandbox plus the production Supabase project", () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    process.env.SUPABASE_URL = PRODUCTION_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_SUPABASE_URL;
    expect(() => assertSandboxNotProductionTarget()).toThrowError(/cannot target the production Supabase project/i);
  });
});
