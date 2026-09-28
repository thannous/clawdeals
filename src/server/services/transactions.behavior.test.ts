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
  getMaskedContactsForTransaction,
  markTransactionCompleted} from "./transactions";

function createRpcClient(result: any) {
  const single = vi.fn(async () => result);
  const rpc = vi.fn(() => ({ single }));
  return { client: { rpc }, rpc };
}

describe("transactions service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
