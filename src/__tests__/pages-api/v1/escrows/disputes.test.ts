import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/agents", () => ({
  getAgentById: vi.fn()
}));

vi.mock("../../../../server/services/escrows", () => ({
  getEscrowById: vi.fn()
}));

vi.mock("../../../../server/services/disputes", () => ({
  openDispute: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/escrows/[escrow_id]/disputes";
import { getAgentById } from "../../../../server/services/agents";
import { getEscrowById } from "../../../../server/services/escrows";
import { openDispute } from "../../../../server/services/disputes";

const getAgentByIdMock = vi.mocked(getAgentById);
const getEscrowByIdMock = vi.mocked(getEscrowById);
const openDisputeMock = vi.mocked(openDispute);

const ESCROW_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SELLER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUYER_OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function request(body: any = { reason_code: "item_not_received" }, headers: any = { "idempotency-key": "idem-1" }) {
  return {
    method: "POST",
    headers,
    query: { escrow_id: ESCROW_ID },
    body
  } as any;
}

function escrow() {
  return {
    escrow_id: ESCROW_ID,
    buyer_agent_id: BUYER_ID,
    seller_agent_id: SELLER_ID,
    status: "DELIVERED"
  };
}

describe("POST /v1/escrows/:escrow_id/disputes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEscrowByIdMock.mockResolvedValue(escrow() as any);
    openDisputeMock.mockResolvedValue({
      dispute_id: "dispute-1",
      escrow_id: ESCROW_ID,
      status: "OPEN",
      opened_by: "BUYER",
      reason_code: "item_not_received",
      opened_at: "2026-07-23T12:00:00.000Z",
      escrow_status: "DISPUTE_OPEN"
    } as any);
  });

  it("requires an idempotency key before revealing escrow existence", async () => {
    const result: any = await handler(request(undefined, {}), null, {
      authError: null,
      agentId: BUYER_ID,
      actor: { type: "agent", id: BUYER_ID }
    });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(getEscrowByIdMock).not.toHaveBeenCalled();
  });

  it("hides escrow existence from an unrelated owner", async () => {
    getAgentByIdMock.mockResolvedValue({ owner_id: "different-owner" } as any);

    const result: any = await handler(request(), null, {
      authError: null,
      ownerId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      actor: { type: "owner", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }
    });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("ESCROW_NOT_FOUND");
    expect(getAgentByIdMock).toHaveBeenCalledTimes(2);
    expect(openDisputeMock).not.toHaveBeenCalled();
  });

  it("allows an owner to act through their buyer agent and redacts free-text evidence", async () => {
    getAgentByIdMock.mockImplementation(async (agentId: string) => {
      if (agentId === BUYER_ID) return { id: BUYER_ID, owner_id: BUYER_OWNER_ID } as any;
      return { id: SELLER_ID, owner_id: "seller-owner" } as any;
    });
    const ctx: any = {
      authError: null,
      ownerId: BUYER_OWNER_ID,
      actor: { type: "owner", id: BUYER_OWNER_ID }
    };

    const result: any = await handler(
      request({
        reason_code: " ITEM_NOT_RECEIVED ",
        notes: "Contact buyer@example.test or +33 6 12 34 56 78 for details"
      }),
      null,
      ctx
    );

    expect(result.status).toBe(201);
    expect(openDisputeMock).toHaveBeenCalledWith({
      escrowId: ESCROW_ID,
      actorAgentId: BUYER_ID,
      reasonCode: "item_not_received",
      openedNotesRedacted: "Contact [REDACTED] or [REDACTED] for details"
    });
    expect(ctx.body.opened_notes_redacted).toBe("Contact [REDACTED] or [REDACTED] for details");
    expect(result.body).not.toHaveProperty("opened_notes_redacted");
  });

  it("rejects an invalid reason before attempting the atomic dispute transition", async () => {
    const result: any = await handler(
      request({ reason_code: "chargeback_everything" }),
      null,
      {
        authError: null,
        agentId: BUYER_ID,
        actor: { type: "agent", id: BUYER_ID }
      }
    );

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(openDisputeMock).not.toHaveBeenCalled();
  });

  it("preserves the duplicate-open conflict returned by the atomic service", async () => {
    openDisputeMock.mockRejectedValue(
      Object.assign(new Error("Dispute already exists"), {
        status: 409,
        code: "DISPUTE_ALREADY_EXISTS"
      })
    );

    const result: any = await handler(request(), null, {
      authError: null,
      agentId: BUYER_ID,
      actor: { type: "agent", id: BUYER_ID }
    });

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("DISPUTE_ALREADY_EXISTS");
  });
});
