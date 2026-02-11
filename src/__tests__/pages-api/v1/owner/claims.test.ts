import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/claims";
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

function makeQueryChain(data: any[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null })
  } as any;
}

describe("GET /v1/owner/claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseServiceClientMock.mockReturnValue({
      from: fromMock
    } as any);
  });

  it("requires owner authentication", async () => {
    const result: any = await handler({ method: "GET", query: {} } as any, null, makeCtx({ ownerId: null, actor: null }));
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns merged claims sorted by created_at desc", async () => {
    const connectChain = makeQueryChain([
      {
        session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "CLAIMED",
        requested_agent_name: "Agent A",
        requested_scopes: ["agent:read"],
        agent_id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-02-10T10:00:00.000Z",
        claimed_at: "2026-02-10T10:03:00.000Z",
        cancelled_at: null,
        expired_at: null,
        delivered_at: null
      }
    ]);

    const deviceChain = makeQueryChain([
      {
        authorization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "PENDING",
        requested_agent_name: "Agent B",
        requested_scopes: ["agent:write"],
        agent_id: null,
        created_at: "2026-02-10T11:00:00.000Z",
        authorized_at: null,
        denied_at: null,
        expired_at: null
      }
    ]);

    fromMock.mockImplementation((table: string) => {
      if (table === "connect_sessions") return connectChain;
      if (table === "oauth_device_authorizations") return deviceChain;
      throw new Error(`Unexpected table ${table}`);
    });

    const ctx: any = makeCtx();
    const result: any = await handler({ method: "GET", query: { limit: "20" } } as any, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.claims).toHaveLength(2);
    expect(result.body.data.claims[0]).toEqual(
      expect.objectContaining({
        source: "device_code",
        claim_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "PENDING",
        requested_agent_name: "Agent B"
      })
    );
    expect(result.body.data.claims[1]).toEqual(
      expect.objectContaining({
        source: "connect_link",
        claim_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "CLAIMED",
        requested_agent_name: "Agent A"
      })
    );
    expect(ctx.auditEvent).toBe("owner.claims_listed");
  });
});
