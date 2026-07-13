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
vi.mock("../../../../server/services/channel-identities", () => ({ getChannelIdentity: vi.fn() }));
vi.mock("../../../../server/services/installation-scopes-cache", () => ({
  getInstallationOauthScopes: vi.fn()
}));

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
import { handler as watchlistCreateHandler } from "../../../../pages/api/v1/watchlists/index";
import { handler as listingCreateHandler } from "../../../../pages/api/v1/listings";
import { handler as offerCounterHandler } from "../../../../pages/api/v1/offers/[offer_id]/counter";
import { handler as offerCancelHandler } from "../../../../pages/api/v1/offers/[offer_id]/cancel";
import { handler as requestContactRevealHandler } from "../../../../pages/api/v1/transactions/[tx_id]/request-contact-reveal";
import { handler as markCompletedHandler } from "../../../../pages/api/v1/transactions/[tx_id]/mark-completed";
import { getChannelIdentity } from "../../../../server/services/channel-identities";
import { getInstallationOauthScopes } from "../../../../server/services/installation-scopes-cache";

const getStagedCommandForAgentMock = vi.mocked(getStagedCommandForAgent);
const confirmStagedCommandMock = vi.mocked(confirmStagedCommand);
const markStagedCommandExecutedMock = vi.mocked(markStagedCommandExecuted);
const markStagedCommandPendingApprovalMock = vi.mocked(markStagedCommandPendingApproval);
const cancelStagedCommandMock = vi.mocked(cancelStagedCommand);
const markStagedCommandUndoneMock = vi.mocked(markStagedCommandUndone);

const offerCreateHandlerMock = vi.mocked(offerCreateHandler);
const watchlistCreateHandlerMock = vi.mocked(watchlistCreateHandler);
const listingCreateHandlerMock = vi.mocked(listingCreateHandler);
const offerCounterHandlerMock = vi.mocked(offerCounterHandler);
const offerCancelHandlerMock = vi.mocked(offerCancelHandler);
const requestContactRevealHandlerMock = vi.mocked(requestContactRevealHandler);
const markCompletedHandlerMock = vi.mocked(markCompletedHandler);
const getChannelIdentityMock = vi.mocked(getChannelIdentity);
const getInstallationOauthScopesMock = vi.mocked(getInstallationOauthScopes);
const channelIdentityId = "00000000-0000-4000-a000-000000000888";

const baseCtx: any = {
  agentId: "00000000-0000-4000-a000-000000000111",
  ownerId: "00000000-0000-4000-a000-000000000222",
  actor: { type: "agent", id: "00000000-0000-4000-a000-000000000111" },
  authError: null
};

describe("POST /v1/chat/commands/{command_id}:(confirm|cancel|undo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: channelIdentityId,
      owner_id: baseCtx.ownerId,
      channel_type: "telegram",
      channel_user_id: "user-1",
      channel_context_id: "user-1"
    } as any);
  });

  it("requires Idempotency-Key and it must equal command_id", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";

    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: channelIdentityId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: { payload: { listing_id: "00000000-0000-4000-a000-000000000444" } }
    } as any);

    const reqMissing: any = {
      method: "POST",
      headers: {},
      query: { command: `${commandId}:confirm` },
      body: { origin_context: { kind: "control_dm" } }
    };
    const res1: any = await handler(reqMissing, null, { ...baseCtx });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe("VALIDATION_ERROR");

    const reqWrong: any = {
      method: "POST",
      headers: { "idempotency-key": "nope" },
      query: { command: `${commandId}:confirm` },
      body: { origin_context: { kind: "control_dm" } }
    };
    const res2: any = await handler(reqWrong, null, { ...baseCtx });
    expect(res2.status).toBe(400);
    expect(String(res2.body.error.message)).toContain("must equal");
  });

  it("confirm requires explicit origin_context", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: channelIdentityId,
      state: "STAGED",
      action_type: "watchlist.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: { payload: { name: "WL", criteria: { query: "x" }, active: true } }
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: {}
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("ORIGIN_CONTEXT_REQUIRED");
  });

  it("rejects caller-claimed CONTROL_DM authority without a channel attestation", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      state: "STAGED",
      action_type: "watchlist.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: { payload: { name: "WL", criteria: { query: "x" }, active: true } }
    } as any);

    const result: any = await handler(
      {
        method: "POST",
        headers: { "idempotency-key": commandId, "x-clawdeals-origin": "webmcp" },
        query: { command: `${commandId}:confirm` },
        body: { origin_context: { kind: "control_dm" } }
      } as any,
      null,
      { ...baseCtx, origin: "webmcp" }
    );

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("ORIGIN_CONTEXT_UNATTESTED");
    expect(confirmStagedCommandMock).not.toHaveBeenCalled();
    expect(watchlistCreateHandlerMock).not.toHaveBeenCalled();
  });

  it.each([
    ["watchlist.create", "watchlists:write", watchlistCreateHandlerMock],
    ["listing.create", "listings:write", listingCreateHandlerMock],
    ["offer.create", "offers:write", offerCreateHandlerMock],
    ["offer.counter", "offers:write", offerCounterHandlerMock],
    ["contact_reveal.request", "contacts:reveal", requestContactRevealHandlerMock],
    ["transaction.mark_completed", "transactions:write", markCompletedHandlerMock]
  ])(
    "checks current installation grants before confirming %s",
    async (actionType, requiredScope, actionHandlerMock) => {
      const commandId = "00000000-0000-4000-a000-000000000334";
      const stagedRow: any = {
        command_id: commandId,
        agent_id: baseCtx.agentId,
        owner_id: baseCtx.ownerId,
        channel_identity_id: channelIdentityId,
        state: "STAGED",
        action_type: actionType,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        payload_redacted: {
          authority: { decision: "EXECUTED", reason: "control_dm_allowed", requires_control_dm_confirm: false },
          origin_context: { kind: "control_dm" },
          payload: {
            listing_id: "00000000-0000-4000-a000-000000000444",
            offer_id: "00000000-0000-4000-a000-000000000555",
            tx_id: "00000000-0000-4000-a000-000000000666"
          }
        }
      };
      getStagedCommandForAgentMock.mockResolvedValue(stagedRow);
      confirmStagedCommandMock.mockResolvedValue({ ...stagedRow, state: "CONFIRMED" } as any);
      (actionHandlerMock as any).mockResolvedValue({ status: 200, headers: {}, body: {} });
      markStagedCommandExecutedMock.mockResolvedValue({
        ...stagedRow,
        state: "EXECUTED",
        undo_supported: false,
        result_ref_type: null,
        result_ref_id: null
      } as any);

      const req: any = {
        method: "POST",
        headers: { "idempotency-key": commandId },
        query: { command: `${commandId}:confirm` },
        body: { origin_context: { kind: "control_dm" } }
      };
      const ctx: any = {
        ...baseCtx,
        installationId: "00000000-0000-4000-a000-000000000999"
      };

      getInstallationOauthScopesMock.mockResolvedValue(["watchlists:read"] as any);
      const denied: any = await handler(req, null, { ...ctx });
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("INSUFFICIENT_SCOPE");
      expect(denied.body.error.details.required_scopes).toEqual([requiredScope]);
      expect(confirmStagedCommandMock).not.toHaveBeenCalled();
      expect(actionHandlerMock).not.toHaveBeenCalled();

      getInstallationOauthScopesMock.mockResolvedValue([requiredScope] as any);
      const allowed: any = await handler(req, null, { ...ctx });
      expect(allowed.status).toBe(200);
      expect(confirmStagedCommandMock).toHaveBeenCalledTimes(1);
      expect(actionHandlerMock).toHaveBeenCalledTimes(1);
    }
  );

  it("fails closed before confirmation when the current grant set is unavailable", async () => {
    const commandId = "00000000-0000-4000-a000-000000000336";
    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: channelIdentityId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: {
        authority: { decision: "EXECUTED", reason: "control_dm_allowed", requires_control_dm_confirm: false },
        origin_context: { kind: "control_dm" },
        payload: { listing_id: "00000000-0000-4000-a000-000000000444" }
      }
    } as any);
    getInstallationOauthScopesMock.mockRejectedValue(
      Object.assign(new Error("scope cache unavailable"), { status: 503, code: "AUTH_UNAVAILABLE" })
    );

    const result: any = await handler(
      {
        method: "POST",
        headers: { "idempotency-key": commandId },
        query: { command: `${commandId}:confirm` },
        body: { origin_context: { kind: "control_dm" } }
      } as any,
      null,
      {
        ...baseCtx,
        installationId: "00000000-0000-4000-a000-000000000999"
      }
    );

    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("AUTH_UNAVAILABLE");
    expect(confirmStagedCommandMock).not.toHaveBeenCalled();
    expect(offerCreateHandlerMock).not.toHaveBeenCalled();
  });

  it("confirm executes offer.create and enables undo (offer.cancel)", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";
    const offerId = "00000000-0000-4000-a000-000000000555";

    const stagedRow: any = {
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: channelIdentityId,
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: {
        authority: { decision: "EXECUTED", reason: "control_dm_allowed", requires_control_dm_confirm: false },
        origin_context: { kind: "control_dm" },
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
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      owner_id: baseCtx.ownerId,
      channel_type: "telegram",
      channel_user_id: "user-1",
      channel_context_id: "group-1"
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
      body: { origin_context: { kind: "control_dm" } }
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

  it("confirm blocks until command is confirmed from CONTROL_DM when staged from public/group", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";

    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: {
        authority: { decision: "STAGED", reason: "public_group_requires_control_dm", requires_control_dm_confirm: true },
        origin_context: { kind: "public_group" },
        payload: {
          listing_id: listingId,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() + 3600000).toISOString()
        }
      }
    } as any);
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      owner_id: baseCtx.ownerId,
      channel_type: "discord",
      channel_user_id: "user-1",
      channel_context_id: "group-1"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: { origin_context: { kind: "public_group" } }
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONTROL_DM_CONFIRM_REQUIRED");
    expect(confirmStagedCommandMock).not.toHaveBeenCalled();
    expect(offerCreateHandlerMock).not.toHaveBeenCalled();
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "control_dm_confirm_required" });
  });

  it("confirm still requires CONTROL_DM when staged authority is STAGED but request is NEGOTIATION_THREAD", async () => {
    const commandId = "00000000-0000-4000-a000-000000000933";
    const listingId = "00000000-0000-4000-a000-000000000944";

    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: "00000000-0000-4000-a000-000000000889",
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: {
        authority: { decision: "STAGED", reason: "public_group_requires_control_dm", requires_control_dm_confirm: true },
        origin_context: { kind: "public_group" },
        payload: {
          listing_id: listingId,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() + 3600000).toISOString()
        }
      }
    } as any);
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: "00000000-0000-4000-a000-000000000889",
      owner_id: baseCtx.ownerId,
      channel_type: "discord",
      channel_user_id: "user-1",
      channel_context_id: "group-1"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: { origin_context: { kind: "negotiation_thread" } }
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("ORIGIN_CONTEXT_MISMATCH");
    expect(confirmStagedCommandMock).not.toHaveBeenCalled();
    expect(offerCreateHandlerMock).not.toHaveBeenCalled();
  });

  it("confirm enforces request origin policy even when staged authority metadata is missing", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";

    getStagedCommandForAgentMock.mockResolvedValue({
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      state: "STAGED",
      action_type: "offer.create",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload_redacted: {
        payload: {
          listing_id: listingId,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() + 3600000).toISOString()
        }
      }
    } as any);
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      owner_id: baseCtx.ownerId,
      channel_type: "discord",
      channel_user_id: "user-1",
      channel_context_id: "group-1"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:confirm` },
      body: { origin_context: { kind: "public_group" } }
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONTROL_DM_CONFIRM_REQUIRED");
    expect(confirmStagedCommandMock).not.toHaveBeenCalled();
    expect(offerCreateHandlerMock).not.toHaveBeenCalled();
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "control_dm_confirm_required" });
  });

  it("confirm maps offer approval_required to 202 PENDING_APPROVAL and stores approval_id", async () => {
    const commandId = "00000000-0000-4000-a000-000000000333";
    const listingId = "00000000-0000-4000-a000-000000000444";

    const stagedRow: any = {
      command_id: commandId,
      agent_id: baseCtx.agentId,
      owner_id: baseCtx.ownerId,
      channel_identity_id: channelIdentityId,
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
      body: { origin_context: { kind: "control_dm" } }
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
        channel_identity_id: channelIdentityId,
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
      body: { origin_context: { kind: "control_dm" } }
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

  it("checks current offers:write scope before undoing offer.create", async () => {
    const commandId = "00000000-0000-4000-a000-000000000335";
    const offerId = "00000000-0000-4000-a000-000000000556";
    const command: any = {
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
    };
    getStagedCommandForAgentMock.mockResolvedValue(command);
    offerCancelHandlerMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: { offer_id: offerId, status: "CANCELLED" }
    } as any);
    markStagedCommandUndoneMock.mockResolvedValue({ ...command, undone_at: new Date().toISOString() } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": commandId },
      query: { command: `${commandId}:undo` },
      body: {}
    };
    const ctx: any = {
      ...baseCtx,
      installationId: "00000000-0000-4000-a000-000000000999"
    };

    getInstallationOauthScopesMock.mockResolvedValue(["watchlists:read"] as any);
    const denied: any = await handler(req, null, { ...ctx });
    expect(denied.status).toBe(403);
    expect(denied.body.error.details.required_scopes).toEqual(["offers:write"]);
    expect(offerCancelHandlerMock).not.toHaveBeenCalled();
    expect(markStagedCommandUndoneMock).not.toHaveBeenCalled();

    getInstallationOauthScopesMock.mockResolvedValue(["offers:write"] as any);
    const allowed: any = await handler(req, null, { ...ctx });
    expect(allowed.status).toBe(200);
    expect(offerCancelHandlerMock).toHaveBeenCalledTimes(1);
    expect(markStagedCommandUndoneMock).toHaveBeenCalledTimes(1);
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
