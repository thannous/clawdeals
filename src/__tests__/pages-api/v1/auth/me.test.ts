import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/auth/me";
import { getOwner } from "../../../../server/services/owners";

const ownerId = "11111111-1111-1111-1111-111111111111";

function makeCtx(overrides: any = {}) {
  return { authError: null, ownerId, actor: { type: "owner", id: ownerId }, ...overrides } as any;
}

describe("GET /v1/auth/me", () => {
  it("rejects non-GET", async () => {
    const result: any = await handler({ method: "POST" }, null, makeCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 on auth error", async () => {
    const ctx = makeCtx({ authError: { status: 401, code: "UNAUTHORIZED", message: "Nope" } });
    const result: any = await handler({ method: "GET" }, null, ctx);
    expect(result.status).toBe(401);
  });

  it("returns 401 without owner", async () => {
    const result: any = await handler({ method: "GET" }, null, makeCtx({ ownerId: null, actor: null }));
    expect(result.status).toBe(401);
  });

  it("returns owner session info", async () => {
    vi.mocked(getOwner).mockResolvedValue({
      owner_id: ownerId,
      email: "test@example.com",
      email_verified_at: null
    } as any);

    const ctx = makeCtx();
    const result: any = await handler({ method: "GET" }, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.email).toBe("test@example.com");
    expect(result.body.data.email_verified_at).toBe(null);
    expect(ctx.auditEvent).toBe("auth.me_viewed");
  });
});
