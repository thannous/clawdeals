import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/policy-decisions", () => ({
  listPolicyDecisionsForOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/policy-decisions";
import { listPolicyDecisionsForOwner } from "../../../../server/services/policy-decisions";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function ownerCtx(overrides: any = {}) {
  return {
    authError: null,
    ownerId: OWNER_ID,
    actor: { type: "owner", id: OWNER_ID },
    ...overrides
  } as any;
}

describe("GET /v1/owner/policy-decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner authentication", async () => {
    const result: any = await handler({ method: "GET", query: {} }, null, ownerCtx({ ownerId: null, actor: null }));
    expect(result.status).toBe(401);
  });

  it("rejects unsupported methods and invalid limits", async () => {
    const methodResult: any = await handler({ method: "POST", query: {} }, null, ownerCtx());
    expect(methodResult.status).toBe(405);

    const limitResult: any = await handler({ method: "GET", query: { limit: "21" } }, null, ownerCtx());
    expect(limitResult.status).toBe(400);
  });

  it("returns the latest 20 owner decisions without caching", async () => {
    vi.mocked(listPolicyDecisionsForOwner).mockResolvedValue([
      { decision_id: "audit-1", decision: "AUTO_APPROVED", request_id: "req-1" }
    ] as any);
    const ctx = ownerCtx();

    const result: any = await handler({ method: "GET", query: {} }, null, ctx);

    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(result.body.data.decisions).toHaveLength(1);
    expect(listPolicyDecisionsForOwner).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      limit: 20,
      requestId: null
    });
    expect(ctx.auditEvent).toBe("owner.policy_decisions_listed");
  });

  it("forwards a request_id for an owner-scoped receipt lookup", async () => {
    vi.mocked(listPolicyDecisionsForOwner).mockResolvedValue([]);

    await handler(
      { method: "GET", query: { limit: "1", request_id: "req-owned" } },
      null,
      ownerCtx()
    );

    expect(listPolicyDecisionsForOwner).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      limit: 1,
      requestId: "req-owned"
    });
  });
});
