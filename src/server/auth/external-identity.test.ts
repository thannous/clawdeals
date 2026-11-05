import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({ auth: { getUser: mocks.getUser } })
}));

import { verifyExternalAuthIdentity } from "./external-identity";

describe("verifyExternalAuthIdentity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.CLAWDEALS_AUTH_BACKEND;
    delete process.env.NEON_AUTH_BASE_URL;
  });

  it("rejects opaque session bearer tokens even with a live matching cookie", async () => {
    process.env.CLAWDEALS_AUTH_BACKEND = "neon";
    process.env.NEON_AUTH_BASE_URL = "https://auth.example.test/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          session: { token: "neon-session-token", userId: "opaque-neon-subject", expiresAt: "2099-01-01T00:00:00Z" },
          user: { id: "opaque-neon-subject", email: "owner@example.test", emailVerified: true }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      verifyExternalAuthIdentity({
        accessToken: "neon-session-token",
        cookieHeader: "cd_owner_session=secret; __Secure-neon-auth.session_token=neon-session-token"
      })
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.example.test/get-session",
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "__Secure-neon-auth.session_token=neon-session-token" })
      })
    );

    await expect(
      verifyExternalAuthIdentity({
        accessToken: "wrong",
        cookieHeader: "__Secure-neon-auth.session_token=neon-session-token"
      })
    ).resolves.toBeNull();
  });
});
