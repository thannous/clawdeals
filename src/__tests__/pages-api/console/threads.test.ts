import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/threads", () => ({
  listThreads: vi.fn()
}));

vi.mock("../../../server/services/threads-cursor", () => ({
  decodeThreadsCursor: vi.fn()
}));

import { handler } from "../../../pages/api/console/threads";
import { listThreads } from "../../../server/services/threads";
import { decodeThreadsCursor } from "../../../server/services/threads-cursor";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns items and next_cursor", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      items: [
        {
          thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          buyer_agent_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          seller_agent_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          status: "OPEN",
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("passes filters (listing_id, buyer_agent_id, seller_agent_id, status)", async () => {
    vi.mocked(listThreads).mockResolvedValue({ items: [], nextCursor: null });

    const req = {
      method: "GET",
      query: {
        listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
        buyer_agent_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
        seller_agent_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
        status: "OPEN"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listThreads).toHaveBeenCalledWith(expect.objectContaining({
      listingId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      buyerAgentId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      sellerAgentId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      status: "OPEN"
    }));
  });

  it("validates listing_id as UUID when provided (invalid → 400)", async () => {
    const req = { method: "GET", query: { listing_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates buyer_agent_id as UUID when provided (invalid → 400)", async () => {
    const req = { method: "GET", query: { buyer_agent_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates seller_agent_id as UUID when provided (invalid → 400)", async () => {
    const req = { method: "GET", query: { seller_agent_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit", async () => {
    const req = { method: "GET", query: { limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates cursor (decodeThreadsCursor error → 400)", async () => {
    vi.mocked(decodeThreadsCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("default limit is 50", async () => {
    vi.mocked(listThreads).mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: {} };
    await handler(req, null, { ...baseCtx });

    expect(listThreads).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("sets ctx.auditEvent = 'threads.listed'", async () => {
    vi.mocked(listThreads).mockResolvedValue({ items: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: {} };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("threads.listed");
  });

  it("handles service error", async () => {
    vi.mocked(listThreads).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
