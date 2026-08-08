import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNeonAuthClient: vi.fn(() => ({ provider: "neon" })),
  supabaseAdapter: vi.fn(() => "supabase-compatible-adapter"),
  createSupabaseClient: vi.fn(() => ({ provider: "supabase" }))
}));

vi.mock("@neondatabase/auth", () => ({ createAuthClient: mocks.createNeonAuthClient }));
vi.mock("@neondatabase/auth/vanilla/adapters", () => ({ SupabaseAuthAdapter: mocks.supabaseAdapter }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createSupabaseClient }));

describe("getBrowserAuthClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("keeps Supabase as the rollback default", async () => {
    const { getBrowserAuthClient } = await import("./browser-auth-client");
    expect(getBrowserAuthClient()).toEqual({ provider: "supabase" });
    expect(mocks.createSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mocks.createNeonAuthClient).not.toHaveBeenCalled();
  });

  it("uses the Neon proxy with the migration adapter when selected", async () => {
    process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND = "neon";
    const { getBrowserAuthClient } = await import("./browser-auth-client");
    expect(getBrowserAuthClient()).toEqual({ auth: { provider: "neon" } });
    expect(mocks.createNeonAuthClient).toHaveBeenCalledWith("/api/auth", {
      adapter: "supabase-compatible-adapter"
    });
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
  });
});
