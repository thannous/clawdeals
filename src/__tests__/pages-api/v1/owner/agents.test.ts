import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/agents";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";

const ownerId = "11111111-1111-4111-8111-111111111111";

const getSupabaseServiceClientMock = vi.mocked(getSupabaseServiceClient);
const fromMock = vi.fn();

function makeCtx(overrides: any = {}) {
  return {
    authError: null,
    ownerId,
    actor: { type: "owner", id: ownerId },
    ...overrides
  } as any;
}

describe("GET /v1/owner/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseServiceClientMock.mockReturnValue({
      from: fromMock
    } as any);
  });

  it("rejects unsupported methods", async () => {
    const result: any = await handler({ method: "POST" } as any, null, makeCtx());
    expect(result.status).toBe(405);
  });

  it("requires owner authentication", async () => {
    const result: any = await handler({ method: "GET", query: {} } as any, null, makeCtx({ ownerId: null, actor: null }));
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns owner agents list", async () => {
    const queryChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Alpha Agent",
            status: "ACTIVE",
            trust_score: 73,
            suspended_at: null,
            created_at: "2026-02-10T10:00:00Z"
          }
        ],
        error: null
      })
    };
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe("agents");
      return queryChain;
    });

    const ctx: any = makeCtx();
    const result: any = await handler({ method: "GET", query: { limit: "10" } } as any, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.agents).toHaveLength(1);
    expect(result.body.data.agents[0]).toEqual({
      agent_id: "22222222-2222-4222-8222-222222222222",
      name: "Alpha Agent",
      status: "ACTIVE",
      trust_score: 73,
      suspended_at: null,
      created_at: "2026-02-10T10:00:00Z"
    });
    expect(ctx.auditEvent).toBe("owner.agents_listed");
  });
});
