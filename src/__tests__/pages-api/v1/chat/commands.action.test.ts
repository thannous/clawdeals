import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/staged-commands", () => ({
  cancelStagedCommand: vi.fn(),
  confirmStagedCommand: vi.fn(),
  getStagedCommandForAgent: vi.fn(),
  markStagedCommandExecuted: vi.fn(),
  markStagedCommandExpired: vi.fn(),
  markStagedCommandPendingApproval: vi.fn(),
  markStagedCommandUndone: vi.fn()
}));

vi.mock("../../../../pages/api/v1/watchlists/index", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/watchlists/[watchlist_id]", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/listings", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/listings/[id]", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/listings/[id]/offers", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/offers/[offer_id]/counter", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/offers/[offer_id]/cancel", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/transactions/[tx_id]/request-contact-reveal", () => ({ handler: vi.fn() }));
vi.mock("../../../../pages/api/v1/transactions/[tx_id]/mark-completed", () => ({ handler: vi.fn() }));

import { handler } from "../../../../pages/api/v1/chat/commands/[command]";
import {
  cancelStagedCommand,
  confirmStagedCommand,
  getStagedCommandForAgent,
  markStagedCommandExecuted,
  markStagedCommandPendingApproval,
  markStagedCommandUndone
} from "../../../../server/services/staged-commands";

import { handler as offerCreateHandler } from "../../../../pages/api/v1/listings/[id]/offers";
import { handler as offerCancelHandler } from "../../../../pages/api/v1/offers/[offer_id]/cancel";

const getStagedCommandForAgentMock = vi.mocked(getStagedCommandForAgent);
const confirmStagedCommandMock = vi.mocked(confirmStagedCommand);
const markStagedCommandExecutedMock = vi.mocked(markStagedCommandExecuted);
const markStagedCommandPendingApprovalMock = vi.mocked(markStagedCommandPendingApproval);
const cancelStagedCommandMock = vi.mocked(cancelStagedCommand);
const markStagedCommandUndoneMock = vi.mocked(markStagedCommandUndone);

const offerCreateHandlerMock = vi.mocked(offerCreateHandler);
const offerCancelHandlerMock = vi.mocked(offerCancelHandler);

const baseCtx: any = {
  agentId: "00000000-0000-4000-a000-000000000111",
  ownerId: "00000000-0000-4000-a000-000000000222",
  actor: { type: "agent", id: "00000000-0000-4000-a000-000000000111" },
  authError: null
};

describe("POST /v1/chat/commands/{command_id}:(confirm|cancel|undo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key and it must equal command_id", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";

    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: { payload: { listing_id: "00000000-0000-4000-a000-000000000444" } }
    } as any);

    const reqMissing: any = { method: "POST", headers: {}, query: { command: `${commandId}:confirm` }, body: {} };
    const res1: any = await handler(reqMissing, null, { ...baseCtx });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe("VALIDATION_ERROR");

    const reqWrong: any = {
      method: "POST",
      headers: { "idempotency-key": "nope" },
      query: { command: `${commandId}:confirm` },
      body: {}
    };
    const res2: any = await handler(reqWrong, null, { ...baseCtx });
    expect(res2.status).toBe(400);
    expect(String(res2.body.error.message)).toContain("must equal");
  });

  it("confirm executes offer.create and enables undo (offer.cancel)", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";
    const offerId = "00000000-0000-4000-a000-000000000555";

    const stagedRow: any = {
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: {
        payload: {
          listing_id: listingId,
          thread_id: null,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() + 3600000).toISOString()
        }
      }
    };
    getStagedCommandForAgentMock.mockResolvedValue(stagedRow);

    confirmStagedCommandMock.mockResolvedValue({ ...stagedRow, state: "CONFIRMED", confirmed_at: new Date().toISOString() } as any);

    offerCreateHandlerMock.mockResolvedValue({
      status: 201,
      headers: {},
      body: {
        offer_id: offerId,
        thread_id: "00000000-0000-4000-a000-000000000666",
        listing_id: listingId,
        buyer_agent_id: baseCtx.agentId,
        seller_agent_id: "00000000-0000-4000-a000-000000000777",
        amount: 350,
        currency: "EUR",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        status: "CREATED",
        created_at: new Date().toISOString()
      }
    } as any);

    markStagedCommandExecutedMock.mockResolvedValue({
      command_id: commandId,
      state: "EXECUTED",
      action_type: "offer.create",
      result_ref_type: "offer",
      result_ref_id: offerId,
      undo_supported: true,
      undo_action_type: "offer.cancel",
      undo_expires_at: new Date(Date.now() + 30000).toISOString(),
      undone_at: null
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: {}
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.command_id).toBe(commandId);
    expect(result.body.state).toBe("EXECUTED");
    expect(result.body.result_ref?.id).toBe(offerId);
    expect(result.body.undo?.supported).toBe(true);
    expect(result.body.undo?.action_type).toBe("offer.cancel");
    expect(result.body.undo?.state).toBe("AVAILABLE");

    expect(markStagedCommandExecutedMock).toHaveBeenCalledTimes(1);
    expect(ctx.auditEvent).toBe("chat.command_executed");
  });

  it("confirm maps offer approval_required to 202 PENDING_APPROVAL and stores approval_id", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";

    const stagedRow: any = {
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: { payload: { listing_id: listingId, amount: 450, currency: "EUR", expires_at: new Date(Date.now() + 3600000).toISOString() } }
    };
    getStagedCommandForAgentMock.mockResolvedValue(stagedRow);

    confirmStagedCommandMock.mockResolvedValue({ ...stagedRow, state: "CONFIRMED", confirmed_at: new Date().toISOString() } as any);

    offerCreateHandlerMock.mockResolvedValue({
      status: 409,
      headers: {},
      body: {
        error: {
          code: "APPROVAL_REQUIRED",
          message: "Approval required",
          details: { approval_id: "a1", reason: "offer_above_limit" }
        }
      }
    } as any);

    markStagedCommandPendingApprovalMock.mockResolvedValue({ ok: true } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: {}
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(202);
    expect(result.body.state).toBe("PENDING_APPROVAL");
    expect(result.body.approval_id).toBe("a1");
    expect(markStagedCommandPendingApprovalMock).toHaveBeenCalledTimes(1);
    expect(ctx.auditEvent).toBe("chat.command_confirmed");
  });

  it("confirm does not execute if STAGED -> CONFIRMED update no-ops (race with cancel)", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";

    getStagedCommandForAgentMock
      .mockResolvedValueOnce({
        command_id: commandId,
        agent_id: baseCtx.agentId,
        owner_id: baseCtx.ownerId,
        state: "STAGED",
        action_type: "offer.create",
        expires_at: new Date(Date.now() + 60000).toISOString(),
        payload_redacted: { payload: { listing_id: listingId, amount: 450, currency: "EUR", expires_at: new Date(Date.now() + 3600000).toISOString() } }
      } as any)
      .mockResolvedValueOnce({
        command_id: commandId,
        agent_id: baseCtx.agentId,
        owner_id: baseCtx.ownerId,
        state: "CANCELLED",
        action_type: "offer.create",
        expires_at: new Date(Date.now() + 60000).toISOString(),
        payload_redacted: { payload: { listing_id: listingId, amount: 450, currency: "EUR", expires_at: new Date(Date.now() + 3600000).toISOString() } }
      } as any);

    confirmStagedCommandMock.mockResolvedValue(null as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: {}
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("COMMAND_CANCELLED");
    expect(offerCreateHandlerMock).not.toHaveBeenCalled();
  });

  it("undo executes offer.cancel within window", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const offerId = "00000000-0000-4000-a000-000000000555";

    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      state: "EXECUTED",
      action_type: "offer.create",
      result_ref_id: offerId,
      undo_supported: true,
      undo_action_type: "offer.cancel",
      undo_expires_at: new Date(Date.now() + 30000).toISOString(),
      undone_at: null
    } as any);

    offerCancelHandlerMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: { offer_id: offerId, status: "CANCELLED" }
    } as any);

    markStagedCommandUndoneMock.mockResolvedValue({
      command_id: commandId,
      state: "EXECUTED",
      undone_at: new Date().toISOString(),
      undo_supported: true,
      undo_action_type: "offer.cancel",
      undo_expires_at: new Date(Date.now() + 30000).toISOString()
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:undo` },
      body: {}
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.command_id).toBe(commandId);
    expect(result.body.undo?.state).toBe("UNDONE");
    expect(offerCancelHandlerMock).toHaveBeenCalledTimes(1);
    expect(markStagedCommandUndoneMock).toHaveBeenCalledTimes(1);
    expect(ctx.auditEvent).toBe("chat.command_undone");
  });

  it("cancel transitions STAGED -> CANCELLED", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: { payload: {} }
    } as any);

    cancelStagedCommandMock.mockResolvedValue({
      command_id: commandId,
      state: "CANCELLED",
      action_type: "offer.create"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:cancel` },
      body: {}
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.state).toBe("CANCELLED");
    expect(ctx.auditEvent).toBe("chat.command_cancelled");
  });
});
