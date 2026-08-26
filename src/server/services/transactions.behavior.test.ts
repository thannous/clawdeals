import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getAgentById: vi.fn(),
  getOwner: vi.fn(),
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dependencyMocks.getSupabaseServiceClient
}));

vi.mock("./agents", () => ({
  getAgentById: dependencyMocks.getAgentById
}));

vi.mock("./owners", () => ({
  getOwner: dependencyMocks.getOwner
}));

import {
  getContactRevealApprovalByTxId,
  getContactsForTransaction,
  getMaskedContactsForTransaction,
  getTransaction,
  markTransactionCompleted,
  requestContactReveal
} from "./transactions";

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(() => query),
    select: vi.fn(() => query)
  };
  return query;
}

function createRpcClient(result: any) {
  const single = vi.fn(async () => result);
  const rpc = vi.fn(() => ({ single }));
  return { client: { rpc }, rpc };
}

describe("transactions service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries a transaction by its exact id", async () => {
    const row = { tx_id: "tx-1", status: "ACCEPTED" };
    const query = createQuery({ data: row, error: null });
    const client = { from: vi.fn(() => query) };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(getTransaction("tx-1")).resolves.toEqual(row);
    expect(client.from).toHaveBeenCalledWith("transactions");
    expect(query.eq).toHaveBeenCalledWith("tx_id", "tx-1");
  });

  it("loads only the newest contact-reveal approval for a transaction", async () => {
    const query = createQuery({ data: { approval_id: "approval-1" }, error: null });
    const client = { from: vi.fn(() => query) };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await getContactRevealApprovalByTxId("tx-1");

    expect(query.eq).toHaveBeenCalledWith("action_type", "contact_reveal_consent");
    expect(query.eq).toHaveBeenCalledWith("action_ref_id", "tx-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("requests contact reveal through the atomic RPC", async () => {
    const row = { tx_id: "tx-1", contact_reveal_state: "APPROVED" };
    const harness = createRpcClient({ data: row, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(harness.client);

    await expect(
      requestContactReveal({
        txId: "tx-1",
        actorAgentId: "buyer-1"
      })
    ).resolves.toEqual(row);
    expect(harness.rpc).toHaveBeenCalledWith("transaction_request_contact_reveal_v1", {
      p_tx_id: "tx-1",
      p_actor_agent_id: "buyer-1"
    });
  });

  it("preserves current transaction state when completion loses an atomic race", async () => {
    const harness = createRpcClient({
      data: null,
      error: { message: "TX_NOT_READY:ESCROW_HOLD" }
    });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(harness.client);

    await expect(
      markTransactionCompleted({ txId: "tx-1", actorAgentId: "buyer-1" })
    ).rejects.toMatchObject({
      status: 409,
      code: "TX_NOT_READY",
      details: { status: "ESCROW_HOLD" }
    });
  });

  it("fails closed when transaction party ids or agents are missing", async () => {
    await expect(
      getMaskedContactsForTransaction({ buyer_agent_id: "buyer-1" })
    ).rejects.toMatchObject({ status: 500, code: "OWNER_CONTACT_MISSING" });
    expect(dependencyMocks.getAgentById).not.toHaveBeenCalled();

    dependencyMocks.getAgentById
      .mockResolvedValueOnce({ id: "buyer-1", owner_id: "buyer-owner" })
      .mockResolvedValueOnce(null);
    await expect(
      getMaskedContactsForTransaction({
        buyer_agent_id: "buyer-1",
        seller_agent_id: "seller-1"
      })
    ).rejects.toMatchObject({ status: 500, code: "OWNER_CONTACT_MISSING" });
    expect(dependencyMocks.getOwner).not.toHaveBeenCalled();
  });

  it("rejects contact reveal unless both owners have verified email and phone", async () => {
    dependencyMocks.getAgentById.mockImplementation(async (id: string) => ({
      id,
      owner_id: `${id}-owner`
    }));
    dependencyMocks.getOwner
      .mockResolvedValueOnce({
        email: "buyer@example.test",
        email_verified_at: "2026-07-01T00:00:00.000Z",
        phone_e164: "+33612345678",
        phone_verified_at: null
      })
      .mockResolvedValueOnce({
        email: "seller@example.test",
        email_verified_at: "2026-07-01T00:00:00.000Z",
        phone_e164: "+447700900123",
        phone_verified_at: "2026-07-01T00:00:00.000Z"
      });

    await expect(
      getMaskedContactsForTransaction({
        buyer_agent_id: "buyer-1",
        seller_agent_id: "seller-1"
      })
    ).rejects.toMatchObject({ status: 409, code: "OWNER_CONTACT_MISSING" });
  });

  it("returns only masked contacts for fully verified transaction owners", async () => {
    dependencyMocks.getAgentById.mockImplementation(async (id: string) => ({
      id,
      owner_id: `${id}-owner`
    }));
    dependencyMocks.getOwner
      .mockResolvedValueOnce({
        email: "buyer@example.test",
        email_verified_at: "2026-07-01T00:00:00.000Z",
        phone_e164: "+33612345678",
        phone_verified_at: "2026-07-01T00:00:00.000Z"
      })
      .mockResolvedValueOnce({
        email: "seller@example.test",
        email_verified_at: "2026-07-01T00:00:00.000Z",
        phone_e164: "+447700900123",
        phone_verified_at: "2026-07-01T00:00:00.000Z"
      });

    const result = await getMaskedContactsForTransaction({
      buyer_agent_id: "buyer-1",
      seller_agent_id: "seller-1"
    });

    expect(result).toEqual({
      buyer_contact: {
        email_masked: expect.stringContaining("***@"),
        phone_masked: expect.stringContaining("*")
      },
      seller_contact: {
        email_masked: expect.stringContaining("***@"),
        phone_masked: expect.stringContaining("*")
      }
    });
    expect(JSON.stringify(result)).not.toContain("buyer@example.test");
    expect(JSON.stringify(result)).not.toContain("+33612345678");
  });

  it("reveals only the counterparty contact to a transaction party", async () => {
    dependencyMocks.getAgentById.mockImplementation(async (id: string) => ({
      id,
      owner_id: `${id}-owner`
    }));
    const owners = {
      "buyer-1-owner": {
        email: "buyer@example.test",
        email_verified_at: "2026-07-01T00:00:00.000Z",
        phone_e164: "+33612345678",
        phone_verified_at: "2026-07-01T00:00:00.000Z"
      },
      "seller-1-owner": {
        email: "seller@example.test",
        email_verified_at: "2026-07-01T00:00:00.000Z",
        phone_e164: "+447700900123",
        phone_verified_at: "2026-07-01T00:00:00.000Z"
      }
    };
    dependencyMocks.getOwner.mockImplementation(async (ownerId: string) => owners[ownerId]);

    const asBuyer = await getContactsForTransaction(
      { buyer_agent_id: "buyer-1", seller_agent_id: "seller-1" },
      { revealToAgentId: "buyer-1" }
    );
    expect(asBuyer.seller_contact.email).toBe("seller@example.test");
    expect(asBuyer.seller_contact.phone).toBe("+447700900123");
    expect(asBuyer.buyer_contact.email).toBeUndefined();
    expect(asBuyer.buyer_contact.phone).toBeUndefined();

    const asSeller = await getContactsForTransaction(
      { buyer_agent_id: "buyer-1", seller_agent_id: "seller-1" },
      { revealToAgentId: "seller-1" }
    );
    expect(asSeller.buyer_contact.email).toBe("buyer@example.test");
    expect(asSeller.seller_contact.email).toBeUndefined();

    const asStranger = await getContactsForTransaction(
      { buyer_agent_id: "buyer-1", seller_agent_id: "seller-1" },
      { revealToAgentId: "stranger-1" }
    );
    expect(JSON.stringify(asStranger)).not.toContain("buyer@example.test");
    expect(JSON.stringify(asStranger)).not.toContain("seller@example.test");
  });
});
