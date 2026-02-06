import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/approvals", () => ({
  listApprovals: vi.fn(),
  decodeApprovalCursor: vi.fn(),
  APPROVALS_MAX_LIMIT: 100
}));

import { handler } from "../../../../pages/api/v1/approvals/index";
import { listApprovals, decodeApprovalCursor } from "../../../../server/services/approvals";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

const mockedListApprovals = vi.mocked(listApprovals);
const mockedDecodeApprovalCursor = vi.mocked(decodeApprovalCursor);

type OwnerCtx = {
  ownerId: string | null;
  actor: { type: "owner" };
  authError: null;
};

function ownerCtx() {
  return { ownerId, actor: { type: "owner" }, authError: null } satisfies OwnerCtx;
}

function makeReq(query = {}) {
  return { method: "GET", headers: {}, query };
}

describe("GET /v1/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDecodeApprovalCursor.mockReturnValue({ value: null } as any);
  });

  it("returns 405 for non-GET", async () => {
    const req = { method: "POST", headers: {}, query: {} };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 when actor is not owner", async () => {
    const req = makeReq();
    const result: any = await handler(req, null, { actor: { type: "agent" }, authError: null });
    expect(result.status).toBe(401);
  });

  it("returns 401 without ownerId", async () => {
    const req = makeReq();
    const result: any = await handler(req, null, { actor: { type: "owner" }, ownerId: null, authError: null });
    expect(result.status).toBe(401);
  });

  it("returns 400 when ownerId is not a UUID", async () => {
    const req = makeReq();
    const result: any = await handler(req, null, { actor: { type: "owner" }, ownerId: "bad", authError: null });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("UUID");
  });

  it("returns 400 for invalid state", async () => {
    const req = makeReq({ state: "INVALID" });
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("state");
  });

  it("returns 400 when limit is not a number", async () => {
    const req = makeReq({ limit: "abc" });
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("limit");
  });

  it("returns 400 when limit is out of range", async () => {
    const req = makeReq({ limit: "0" });
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("limit");
  });

  it("returns 400 for malformed cursor", async () => {
    mockedDecodeApprovalCursor.mockReturnValue({ error: "Invalid cursor" } as any);
    const req = makeReq({ cursor: "bad-cursor" });
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect((result.body as any).error.message).toContain("cursor");
  });

  it("returns 200 with approvals and next_cursor", async () => {
    mockedListApprovals.mockResolvedValue({
      approvals: [{ approval_id: "a1", state: "PENDING" }],
      nextCursor: "cursor-abc"
    } as any);
    const req = makeReq({ state: "PENDING" });
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(200);
    expect((result.body as any).data.approvals).toHaveLength(1);
    expect((result.body as any).data.next_cursor).toBe("cursor-abc");
  });

  it("filters by state=PENDING", async () => {
    mockedListApprovals.mockResolvedValue({ approvals: [], nextCursor: null } as any);
    const req = makeReq({ state: "PENDING" });
    await handler(req, null, ownerCtx());
    expect(listApprovals).toHaveBeenCalledWith(
      expect.objectContaining({ state: "PENDING" })
    );
  });
});
