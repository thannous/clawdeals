import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { resetSandboxFixtures } from "./sandbox-fixtures";

const SANDBOX_URL_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const STAGING_SUPABASE_URL = "https://usuyppgsmmowzizhaoqj.supabase.co";
const PRODUCTION_SUPABASE_URL = "https://gztfmpuqtpvncdcuhqxy.supabase.co";

describe("resetSandboxFixtures", () => {
  const prevEnv = process.env.CLAWDEALS_ENV;
  const prevSupabaseUrls = Object.fromEntries(
    SANDBOX_URL_KEYS.map((key) => [key, process.env[key]])
  );

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAWDEALS_ENV = "sandbox";
    for (const key of SANDBOX_URL_KEYS) {
      process.env[key] = STAGING_SUPABASE_URL;
    }
  });

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

  it("refuses to seed fixtures when sandbox points at production Supabase", async () => {
    process.env.SUPABASE_URL = PRODUCTION_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_SUPABASE_URL;
    await expect(resetSandboxFixtures({ agentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })).rejects.toMatchObject({
      status: 403,
      code: "PRODUCTION_TARGET_FORBIDDEN"
    });
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  });
});
