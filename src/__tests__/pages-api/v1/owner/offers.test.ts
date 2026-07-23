import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../../../../server/services/offers", () => ({
  listOffersByAgent: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/offers";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { listOffersByAgent } from "../../../../server/services/offers";

const getSupabaseServiceClientMock = vi.mocked(getSupabaseServiceClient);
const listOffersByAgentMock = vi.mocked(listOffersByAgent);

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_AGENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function setOwnedAgents(agentIds: string[], error: any = null) {
  const result = { data: agentIds.map((id) => ({ id })), error };
  const query: any = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query)
  };
  query.then = (resolve: (value: any) => void, reject: (reason: any) => void) =>
    Promise.resolve(result).then(resolve, reject);
  getSupabaseServiceClientMock.mockReturnValue({
    from: vi.fn(() => query)
  } as any);
  return query;
}

function context(overrides: any = {}) {
  return {
    authError: null,
    actor: { type: "owner", id: OWNER_ID },
    ownerId: OWNER_ID,
    ...overrides
  } as any;
}

describe("GET /v1/owner/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOwnedAgents([AGENT_ID]);
    listOffersByAgentMock.mockResolvedValue({
      items: [{ offer_id: "offer-1" }],
      nextCursor: "next"
    } as any);
  });

  it("requires an owner or agent actor bound to an owner", async () => {
    const result: any = await handler(
      { method: "GET", query: {} } as any,
      null,
      context({ actor: { type: "system", id: "cron" } })
    );

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(getSupabaseServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns an empty page without querying offers when the requested agent is not owned", async () => {
    const result: any = await handler(
      { method: "GET", query: { agent_id: OTHER_AGENT_ID } } as any,
      null,
      context()
    );

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ offers: [], next_cursor: null });
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(listOffersByAgentMock).not.toHaveBeenCalled();
  });

  it("passes only owned agents and validated pagination filters to the service", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        created_at: "2026-07-23T12:00:00.000Z",
        offer_id: "offer-2"
      })
    ).toString("base64");
    setOwnedAgents([AGENT_ID, OTHER_AGENT_ID]);

    const result: any = await handler(
      {
        method: "GET",
        query: {
          status: "created",
          limit: "25",
          cursor,
          agent_id: AGENT_ID
        }
      } as any,
      null,
      context()
    );

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({
      offers: [{ offer_id: "offer-1" }],
      next_cursor: "next"
    });
    expect(listOffersByAgentMock).toHaveBeenCalledWith({
      agentIds: [AGENT_ID],
      status: "CREATED",
      limit: 25,
      cursor: {
        created_at: "2026-07-23T12:00:00.000Z",
        offer_id: "offer-2"
      }
    });
  });

  it("rejects malformed cursors and invalid status filters before listing offers", async () => {
    const badCursor: any = await handler(
      { method: "GET", query: { cursor: "not-base64-json" } } as any,
      null,
      context()
    );
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error.message).toBe("Invalid cursor");

    const badStatus: any = await handler(
      { method: "GET", query: { status: "paid" } } as any,
      null,
      context()
    );
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error.message).toBe("status is invalid");
    expect(listOffersByAgentMock).not.toHaveBeenCalled();
  });

  it("fails closed when owned-agent lookup fails", async () => {
    setOwnedAgents([], { message: "database unavailable" });

    const result: any = await handler(
      { method: "GET", query: {} } as any,
      null,
      context()
    );

    expect(result.status).toBe(500);
    expect(result.body.error.message).toBe("Failed to fetch agents");
    expect(listOffersByAgentMock).not.toHaveBeenCalled();
  });
});
