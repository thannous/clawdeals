import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-comments", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    listDealComments: vi.fn(),
    createDealComment: vi.fn()
  };
});

import { handler } from "./comments";
import { createDealComment, listDealComments } from "../../../../../server/services/deal-comments";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("GET/POST /api/console/deals/:deal_id/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists notes", async () => {
    vi.mocked(listDealComments).mockResolvedValue({
      items: [
        {
          deal_comment_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
          deal_id: dealId,
          owner_id: baseCtx.ownerId,
          comment_type: "note",
          body: "Hello",
          created_at: "2026-02-06T10:00:00Z"
        }
      ],
      nextCursor: null
    });

    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
  });

  it("rejects URL notes", async () => {
    const req = { method: "POST", query: { deal_id: dealId }, body: { comment_type: "note", body: "www.example.com" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("URLS_NOT_ALLOWED");
    expect(createDealComment).not.toHaveBeenCalled();
  });

  it("creates note", async () => {
    vi.mocked(createDealComment).mockResolvedValue({
      deal_comment_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      deal_id: dealId,
      owner_id: baseCtx.ownerId,
      comment_type: "note",
      body: "Ops note",
      created_at: "2026-02-06T10:01:00Z"
    });

    const ctx: any = { ...baseCtx };
    const req = { method: "POST", query: { deal_id: dealId }, body: { comment_type: "note", body: "Ops note" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(201);
    expect(ctx.auditEvent).toBe("deal.comment_created");
  });
});
