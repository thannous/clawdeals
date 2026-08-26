import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionReceipt } from "../activity/action-receipts";

const { getWebMcpActionReceipt } = vi.hoisted(() => ({
  getWebMcpActionReceipt: vi.fn()
}));

vi.mock("../ui-bridge", () => ({
  getWebMcpActionReceipt
}));

import { activityTools } from "./activity-tools";

const receipt: ActionReceipt = {
  receipt_version: "1",
  receipt_id: "rcpt_req-1",
  request_id: "req-1",
  tool: { name: "make_offer", version: "2026-08-26" },
  actor: "agent",
  arguments_summary: { amount: 1290, api_key: "[REDACTED]" },
  input_hash: `sha256:${"a".repeat(64)}`,
  policy: { decision: "server_enforced", limit: 1300 },
  confirmation: "approved",
  approval_ids: ["approval-1"],
  outcome: "success",
  best_effort_error: null,
  result: { offer_id: "offer-1", status: "accepted" },
  timestamp: "2026-08-26T10:00:00.000Z",
  link: "/webmcp"
};

describe("get_action_receipt", () => {
  beforeEach(() => getWebMcpActionReceipt.mockReset());

  it("returns a versioned receipt by request ID", async () => {
    getWebMcpActionReceipt.mockReturnValue(receipt);
    const tool = activityTools[0];
    const result = await tool.execute(
      { request_id: "req-1" },
      { requestId: "lookup-1", idempotencyKey: null }
    );

    expect(getWebMcpActionReceipt).toHaveBeenCalledWith({
      receiptId: undefined,
      requestId: "req-1"
    });
    expect(result).toEqual({ ok: true, data: receipt, meta: { request_id: "lookup-1" } });
  });

  it("returns a stable not-found error", async () => {
    getWebMcpActionReceipt.mockReturnValue(null);
    const result = await activityTools[0].execute(
      { receipt_id: "missing" },
      { requestId: "lookup-2", idempotencyKey: null }
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
      meta: { request_id: "lookup-2" }
    });
  });

  it("requires exactly one identifier", () => {
    const schema = activityTools[0].zodSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ receipt_id: "a", request_id: "b" }).success).toBe(false);
    expect(schema.safeParse({ receipt_id: "a" }).success).toBe(true);
  });
});
