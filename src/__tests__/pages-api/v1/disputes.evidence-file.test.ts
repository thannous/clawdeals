import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/config/ops", () => ({
  getOpsConsoleOwnerId: vi.fn()
}));

vi.mock("../../../server/services/disputes", () => ({
  getDisputeById: vi.fn()
}));

vi.mock("../../../server/services/evidence", () => ({
  getEscrow: vi.fn(),
  getEvidenceItemReadUrl: vi.fn()
}));

vi.mock("../../../server/services/protected-checkout", () => ({
  resolveEscrowParties: vi.fn()
}));

import { handler } from "../../../pages/api/v1/disputes/[dispute_id]/evidence/[evidence_item_id]";
import { getOpsConsoleOwnerId } from "../../../server/config/ops";
import { getDisputeById } from "../../../server/services/disputes";
import { getEscrow, getEvidenceItemReadUrl } from "../../../server/services/evidence";
import { resolveEscrowParties } from "../../../server/services/protected-checkout";

const OPS_OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const BUYER_AGENT_ID = "00000000-0000-4000-8000-0000000000b1";
const OTHER_AGENT_ID = "00000000-0000-4000-8000-0000000000c1";
const DISPUTE_ID = "00000000-0000-4000-8000-000000000001";
const ESCROW_ID = "00000000-0000-4000-8000-000000000002";
const EVIDENCE_ITEM_ID = "00000000-0000-4000-8000-000000000003";
const SIGNED_URL = "https://storage.test/private?token=short-lived";

function response() {
  const headers = new Map<string, string>();
  const res: any = {
    statusCode: 200,
    setHeader: vi.fn((name: string, value: string) => headers.set(name.toLowerCase(), value)),
    end: vi.fn()
  };
  return { res, headers };
}

function request() {
  return {
    method: "GET",
    query: { dispute_id: DISPUTE_ID, evidence_item_id: EVIDENCE_ITEM_ID }
  } as any;
}

describe("GET /api/v1/disputes/:dispute_id/evidence/:evidence_item_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOpsConsoleOwnerId).mockReturnValue(OPS_OWNER_ID);
    vi.mocked(getDisputeById).mockResolvedValue({ dispute_id: DISPUTE_ID, escrow_id: ESCROW_ID } as any);
    vi.mocked(getEscrow).mockResolvedValue({
      escrow_id: ESCROW_ID,
      buyer_agent_id: BUYER_AGENT_ID,
      seller_agent_id: OTHER_AGENT_ID
    } as any);
    vi.mocked(resolveEscrowParties).mockResolvedValue({ buyer: true, seller: false } as any);
    vi.mocked(getEvidenceItemReadUrl).mockResolvedValue({ url: SIGNED_URL } as any);
  });

  it("returns a bodyless private redirect only after dispute-party authorization", async () => {
    const { res, headers } = response();
    const ctx: any = {
      actor: { type: "agent", id: BUYER_AGENT_ID },
      agentId: BUYER_AGENT_ID,
      ownerId: null,
      authError: null
    };

    await handler(request(), res, ctx);

    expect(res.statusCode).toBe(302);
    expect(headers.get("location")).toBe(SIGNED_URL);
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.end).toHaveBeenCalledWith();
    expect(ctx.body).toEqual({
      dispute_id: DISPUTE_ID,
      evidence_item_id: EVIDENCE_ITEM_ID
    });
    expect(JSON.stringify(ctx.body)).not.toContain(SIGNED_URL);
    expect(getEvidenceItemReadUrl).toHaveBeenCalledWith({
      disputeId: DISPUTE_ID,
      evidenceItemId: EVIDENCE_ITEM_ID
    });
  });

  it("hides evidence from a stranger without requesting a storage URL", async () => {
    vi.mocked(resolveEscrowParties).mockResolvedValue({ buyer: false, seller: false } as any);

    const result: any = await handler(request(), null, {
      actor: { type: "agent", id: OTHER_AGENT_ID },
      agentId: OTHER_AGENT_ID,
      ownerId: null,
      authError: null
    });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
    expect(getEvidenceItemReadUrl).not.toHaveBeenCalled();
  });

  it("preserves authentication errors before querying the dispute or storage", async () => {
    const result: any = await handler(request(), null, {
      authError: { status: 401, code: "UNAUTHORIZED", message: "Unauthorized" }
    });

    expect(result.status).toBe(401);
    expect(getDisputeById).not.toHaveBeenCalled();
    expect(getEvidenceItemReadUrl).not.toHaveBeenCalled();
  });
});
