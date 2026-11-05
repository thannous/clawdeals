import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("./neon-client", () => ({ getNeonDataClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { getSupabaseServiceClient } from "./supabase";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("independent database service facade", () => {
  it("does not initialize or require source credentials for Neon data", () => {
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "neon");
    vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    getSupabaseServiceClient().from("owners"); getSupabaseServiceClient().rpc("test", {});
    expect(mocks.from).toHaveBeenCalledWith("owners");
    expect(mocks.rpc).toHaveBeenCalledWith("test", {});
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("retains Supabase as default and initializes separate auth/storage lazily", () => {
    vi.stubEnv("SUPABASE_URL", "https://fixture.invalid"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-not-secret");
    const original = { auth: { marker: "auth" }, storage: { marker: "storage" }, from: vi.fn() };
    mocks.create.mockReturnValue(original);
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "neon");
    const facade = getSupabaseServiceClient();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(facade.auth).toBe(original.auth); expect(facade.storage).toBe(original.storage);
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "");
    expect(getSupabaseServiceClient()).toBe(original);
  });
  it("rejects an unknown backend instead of selecting a fallback", () => {
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "unknown");
    expect(() => getSupabaseServiceClient()).toThrow("must be one of");
  });
});
