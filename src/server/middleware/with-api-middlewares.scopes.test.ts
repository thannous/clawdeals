import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

vi.mock("../services/installation-scopes-cache", () => ({
  getInstallationOauthScopes: vi.fn()
}));

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

import { enforceInstallationScopesForRouteGroup } from "./with-api-middlewares";
import { getInstallationOauthScopes } from "../services/installation-scopes-cache";

describe("withApiMiddlewares scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("intersects OAuth token scopes with installation scopes", async () => {
    const ctx: any = {
      actor: { type: "agent", id: "agent-1" },
      agentId: "agent-1",
      installationId: "00000000-0000-4000-a000-000000000223",
      oauthScopes: ["watchlists:read"],
      authError: null
    };
    vi.mocked(getInstallationOauthScopes).mockResolvedValue(["watchlists:read", "listings:write"] as any);

    const denied: any = await enforceInstallationScopesForRouteGroup(ctx, "listings.create");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("INSUFFICIENT_SCOPE");

    ctx.oauthScopes = ["watchlists:read", "listings:write"];
    await expect(enforceInstallationScopesForRouteGroup(ctx, "listings.create")).resolves.toBeNull();
  });

  it("fails closed when installation grants cannot be loaded", async () => {
    vi.mocked(getInstallationOauthScopes).mockRejectedValue(
      Object.assign(new Error("scope cache unavailable"), { status: 503, code: "AUTH_UNAVAILABLE" })
    );

    const response: any = await enforceInstallationScopesForRouteGroup(
      {
        actor: { type: "agent", id: "agent-1" },
        installationId: "00000000-0000-4000-a000-000000000555",
        authError: null
      },
      "evidence.write"
    );

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_UNAVAILABLE");
  });
});
