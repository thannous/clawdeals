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

const listDealCommentsMock = vi.mocked(listDealComments);
const createDealCommentMock = vi.mocked(createDealComment);

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("GET/POST /v1/deals/:deal_id/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner authentication", async () => {
    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("lists comments", async () => {
    listDealCommentsMock.mockResolvedValue({
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
    } as any);

    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].author.type).toBe("human");
  });

  it("rejects URLs in notes", async () => {
    const req = { method: "POST", query: { deal_id: dealId }, body: { comment_type: "note", body: "see https://example.com" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("URLS_NOT_ALLOWED");
    expect(createDealComment).not.toHaveBeenCalled();
  });

  it("creates note comment and sets audit event", async () => {
    createDealCommentMock.mockResolvedValue({
      deal_comment_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      deal_id: dealId,
      owner_id: baseCtx.ownerId,
      comment_type: "note",
      body: "Ops note",
      created_at: "2026-02-06T10:01:00Z"
    } as any);

    const ctx: any = { ...baseCtx };
    const req = { method: "POST", query: { deal_id: dealId }, body: { comment_type: "note", body: "Ops note" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(ctx.auditEvent).toBe("deal.comment_created");
    expect(result.body.comment.body).toBe("Ops note");
  });
});
