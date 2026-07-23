import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import {
  createEscrow,
  getEscrowById,
  getEscrowByPaymentId,
  getEscrowByPayoutId,
  getEscrowByRefundId,
  getEscrowByTxId,
  mapEscrowRpcError,
  markEscrowConfirmed,
  markEscrowDelivered,
  markEscrowHold,
  markEscrowRefunded,
  markEscrowReleased,
  setEscrowPayment,
  setEscrowReleasePending
} from "./escrows";

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query)
  };
  return query;
}

function createRpcClient(result: any) {
  const single = vi.fn(async () => result);
  const rpc = vi.fn(() => ({ single }));
  return { client: { rpc }, rpc };
}

describe("escrows service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["escrow id", getEscrowById, "escrow_id"],
    ["transaction id", getEscrowByTxId, "tx_id"],
    ["payment id", getEscrowByPaymentId, "psp_payment_id"],
    ["payout id", getEscrowByPayoutId, "psp_payout_id"],
    ["refund id", getEscrowByRefundId, "psp_refund_id"]
  ])("looks up escrow by %s without broadening the query", async (_label, getter, column) => {
    const row = { escrow_id: "escrow-1" };
    const query = createQuery({ data: row, error: null });
    const client = { from: vi.fn(() => query) };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(getter("lookup-1")).resolves.toEqual(row);
    expect(client.from).toHaveBeenCalledWith("escrows");
    expect(query.eq).toHaveBeenCalledWith(column, "lookup-1");
  });

  const rpcCases: Array<{
    label: string;
    invoke: () => Promise<any>;
    rpc: string;
    args: any;
  }> = [
    {
      label: "create",
      invoke: () => createEscrow({ txId: "tx-1", actorAgentId: "agent-1", feeBps: 250 }),
      rpc: "escrow_create_v0",
      args: { p_tx_id: "tx-1", p_actor_agent_id: "agent-1", p_fee_bps: 250 }
    },
    {
      label: "set payment",
      invoke: () =>
        setEscrowPayment({
          escrowId: "escrow-1",
          actorAgentId: "agent-1",
          provider: "mock",
          paymentId: "payment-1"
        }),
      rpc: "escrow_set_payment_v0",
      args: {
        p_escrow_id: "escrow-1",
        p_actor_agent_id: "agent-1",
        p_psp_provider: "mock",
        p_psp_payment_id: "payment-1"
      }
    },
    {
      label: "mark hold",
      invoke: () => markEscrowHold({ paymentId: "payment-1" }),
      rpc: "escrow_mark_hold_v0",
      args: {
        p_psp_payment_id: "payment-1",
        p_psp_hold_id: null,
        p_hold_expires_at: null
      }
    },
    {
      label: "mark delivered",
      invoke: () => markEscrowDelivered({ escrowId: "escrow-1", actorAgentId: "seller-1" }),
      rpc: "escrow_mark_delivered_v0",
      args: { p_escrow_id: "escrow-1", p_actor_agent_id: "seller-1" }
    },
    {
      label: "mark confirmed",
      invoke: () => markEscrowConfirmed({ escrowId: "escrow-1", actorAgentId: "buyer-1" }),
      rpc: "escrow_mark_confirmed_v0",
      args: { p_escrow_id: "escrow-1", p_actor_agent_id: "buyer-1" }
    },
    {
      label: "set release pending",
      invoke: () => setEscrowReleasePending({ escrowId: "escrow-1", payoutId: "payout-1" }),
      rpc: "escrow_set_release_pending_v0",
      args: { p_escrow_id: "escrow-1", p_psp_payout_id: "payout-1" }
    },
    {
      label: "mark released",
      invoke: () => markEscrowReleased({ payoutId: "payout-1" }),
      rpc: "escrow_mark_released_v0",
      args: { p_psp_payout_id: "payout-1" }
    },
    {
      label: "mark refunded",
      invoke: () => markEscrowRefunded({ refundId: "refund-1" }),
      rpc: "escrow_mark_refunded_v0",
      args: { p_psp_refund_id: "refund-1" }
    }
  ];

  it.each(rpcCases)("executes the $label transition through its atomic RPC", async ({ invoke, rpc: rpcName, args }) => {
    const row = { escrow_id: "escrow-1", status: "UPDATED" };
    const harness = createRpcClient({ data: row, error: null });
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client);

    await expect(invoke()).resolves.toEqual(row);
    expect(harness.rpc).toHaveBeenCalledWith(rpcName, args);
  });

  it("preserves state details when an atomic escrow transition loses a race", async () => {
    const harness = createRpcClient({
      data: null,
      error: { message: "ESCROW_NOT_ACTIONABLE:DISPUTE_OPEN" }
    });
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client);

    await expect(
      markEscrowDelivered({ escrowId: "escrow-1", actorAgentId: "seller-1" })
    ).rejects.toMatchObject({
      status: 409,
      code: "ESCROW_NOT_ACTIONABLE",
      details: { status: "DISPUTE_OPEN" }
    });
  });

  it.each([
    ["ESCROW_NOT_FOUND", 404, "ESCROW_NOT_FOUND"],
    ["ESCROW_PAYMENT_ALREADY_SET", 409, "ESCROW_PAYMENT_ALREADY_SET"],
    ["ESCROW_NOT_ACTIONABLE:DELIVERED", 409, "ESCROW_NOT_ACTIONABLE"]
  ])("maps %s to its public contract", (message, status, code) => {
    expect(mapEscrowRpcError({ message })).toMatchObject({ status, code });
  });

  it("falls back to the shared database error contract", () => {
    expect(mapEscrowRpcError({ message: "database unavailable" })).toEqual({
      status: 500,
      code: "DATABASE_ERROR",
      message: "database unavailable"
    });
  });
});
