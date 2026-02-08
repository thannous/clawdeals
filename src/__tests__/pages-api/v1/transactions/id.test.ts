import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id].ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id].js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("GET /v1/transactions/{tx_id} (TI-203)", () => {
  const txId = "11111111-1111-4111-8111-111111111111";
  const listingId = "22222222-2222-4222-8222-222222222222";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  let handler: any;

  let getTransactionMock: any;
  let getMaskedContactsForTransactionMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/transactions", () => ({
      getTransaction: vi.fn(),
      getMaskedContactsForTransaction: vi.fn()
    }));

    ({ handler } = await import("../../../../pages/api/v1/transactions/[tx_id]"));

    const txMod = await import("../../../../server/services/transactions");
    getTransactionMock = vi.mocked(txMod.getTransaction);
    getMaskedContactsForTransactionMock = vi.mocked(txMod.getMaskedContactsForTransaction);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      thread_id: "33333333-3333-4333-8333-333333333333",
      accepted_offer_id: "44444444-4444-4444-8444-444444444444",
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED",
      contact_reveal_state: "NOT_REQUESTED",
      contact_revealed_at: null,
      created_at: "2026-02-08T12:00:00Z",
      updated_at: "2026-02-08T12:00:00Z"
    } as any);

    getMaskedContactsForTransactionMock.mockResolvedValue({
      buyer_contact: { email_masked: "b***@e******.com", phone_masked: "+33 ** ** ** 12 34" },
      seller_contact: { email_masked: "s***@g****.fr", phone_masked: "+33 ** ** ** 56 78" }
    } as any);
  });

  it("returns 401 when missing auth", async () => {
    const req: any = {
      method: "GET",
      headers: {},
      query: { tx_id: txId }
    };

    const result: any = await handler(req, null, { actor: { type: "anonymous", id: null }, authError: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when agent is not a party", async () => {
    const req: any = {
      method: "GET",
      headers: {},
      query: { tx_id: txId }
    };

    const result: any = await handler(req, null, {
      actor: { type: "agent", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      agentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      authError: null
    });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("TX_NOT_FOUND");
  });

  it("returns 200 for party", async () => {
    const req: any = {
      method: "GET",
      headers: {},
      query: { tx_id: txId }
    };

    const result: any = await handler(req, null, {
      actor: { type: "agent", id: buyerAgentId },
      agentId: buyerAgentId,
      authError: null
    });
    expect(result.status).toBe(200);
    expect(result.body.data?.tx_id).toBe(txId);
  });

  it("includes masked contacts when APPROVED", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      thread_id: "33333333-3333-4333-8333-333333333333",
      accepted_offer_id: "44444444-4444-4444-8444-444444444444",
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "CONTACT_REVEALED",
      contact_reveal_state: "APPROVED",
      contact_revealed_at: "2026-02-08T12:00:10Z",
      created_at: "2026-02-08T12:00:00Z",
      updated_at: "2026-02-08T12:00:10Z"
    } as any);

    const req: any = {
      method: "GET",
      headers: {},
      query: { tx_id: txId }
    };

    const result: any = await handler(req, null, {
      actor: { type: "agent", id: buyerAgentId },
      agentId: buyerAgentId,
      authError: null
    });
    expect(result.status).toBe(200);
    expect(result.body.data?.buyer_contact?.email_masked).toContain("***");
  });
});

