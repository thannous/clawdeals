import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ neon: vi.fn(() => ({ fixture: true })), supabase: vi.fn() }));
vi.mock("@neondatabase/auth", () => ({ createAuthClient: mocks.neon }));
vi.mock("@neondatabase/auth/vanilla/adapters", () => ({ SupabaseAuthAdapter: () => ({}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.supabase }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
// Actual browser execution found SDK rejects relative base URLs.
it("constructs Neon with absolute current-origin proxy URL, not external configuration", async () => {
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", "neon");
  const { getBrowserAuthClient } = await import("./browser-auth-client");
  getBrowserAuthClient(); getBrowserAuthClient();
  expect(mocks.neon).toHaveBeenCalledOnce();
  expect(mocks.neon).toHaveBeenCalledWith(`${window.location.origin}/api/auth`, expect.any(Object));
  expect(mocks.supabase).not.toHaveBeenCalled();
});

it("blocks external auth in a rehearsal bundle before constructing either client", async () => {
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE", "true");
  for (const backend of ["neon", "supabase"]) {
    vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", backend);
    const { getBrowserAuthClient } = await import("./browser-auth-client");
    expect(getBrowserAuthClient).toThrow(/disabled in rehearsal/);
  }
  expect(mocks.neon).not.toHaveBeenCalled();
  expect(mocks.supabase).not.toHaveBeenCalled();
});
