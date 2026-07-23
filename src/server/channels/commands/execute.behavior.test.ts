import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveIdentityByChannel: vi.fn(),
  findPendingIdentityByChannel: vi.fn(),
  revokePairing: vi.fn(),
  touchLastSeen: vi.fn(),
  getPolicyOrDefault: vi.fn(),
  getAgentIdByOwnerId: vi.fn(),
  listWatchlistsPage: vi.fn(),
  listApprovals: vi.fn(),
  getApprovalForOwner: vi.fn(),
  resolveApproval: vi.fn(),
  getOpsStatusSnapshot: vi.fn(),
  createPairToken: vi.fn(),
  consumePairToken: vi.fn(),
  pairChannelIdentityForOwner: vi.fn(),
  rateLimitMiddleware: vi.fn(),
  getOrCreateNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  buildNotificationsKeyboard: vi.fn(),
  createConfirmation: vi.fn(),
  consumeConfirmation: vi.fn(),
  getTransaction: vi.fn(),
  createMessage: vi.fn(),
  createOrGetControlDmThread: vi.fn(),
  clearActiveListingDraftForChannel: vi.fn(),
  cancelStagedCommandsForChannelIdentity: vi.fn()
}));

vi.mock("../../services/channel-identities", () => ({
  findActiveIdentityByChannel: mocks.findActiveIdentityByChannel,
  findPendingIdentityByChannel: mocks.findPendingIdentityByChannel,
  revokePairing: mocks.revokePairing,
  touchLastSeen: mocks.touchLastSeen
}));

vi.mock("../../services/policies", () => ({
  getPolicyOrDefault: mocks.getPolicyOrDefault
}));

vi.mock("../../services/agents", () => ({
  getAgentIdByOwnerId: mocks.getAgentIdByOwnerId
}));

vi.mock("../../services/watchlists", () => ({
  listWatchlistsPage: mocks.listWatchlistsPage
}));

vi.mock("../../services/approvals", () => ({
  listApprovals: mocks.listApprovals,
  getApprovalForOwner: mocks.getApprovalForOwner,
  resolveApproval: mocks.resolveApproval
}));

vi.mock("../../services/ops-status", () => ({
  getOpsStatusSnapshot: mocks.getOpsStatusSnapshot
}));

vi.mock("../../services/pairing-tokens", () => ({
  createPairToken: mocks.createPairToken,
  consumePairToken: mocks.consumePairToken
}));

vi.mock("../../services/channel-pairing", () => ({
  pairChannelIdentityForOwner: mocks.pairChannelIdentityForOwner
}));

vi.mock("../../rate-limit/middleware", () => ({
  rateLimitMiddleware: mocks.rateLimitMiddleware
}));

vi.mock("../../services/notification-preferences", () => ({
  getOrCreateNotificationPreferences: mocks.getOrCreateNotificationPreferences,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
  NOTIFICATION_EVENT_TYPES: ["watchlist_match", "approval_required"]
}));

vi.mock("../telegram/keyboard", () => ({
  buildNotificationsKeyboard: mocks.buildNotificationsKeyboard
}));

vi.mock("../command-confirmations", () => ({
  createConfirmation: mocks.createConfirmation,
  consumeConfirmation: mocks.consumeConfirmation
}));

vi.mock("../../services/transactions", () => ({
  getTransaction: mocks.getTransaction
}));

vi.mock("../../services/threads", () => ({
  createMessage: mocks.createMessage,
  createOrGetControlDmThread: mocks.createOrGetControlDmThread
}));

vi.mock("../../services/listing-drafts", () => ({
  clearActiveListingDraftForChannel: mocks.clearActiveListingDraftForChannel
}));

vi.mock("../../services/staged-commands", () => ({
  cancelStagedCommandsForChannelIdentity: mocks.cancelStagedCommandsForChannelIdentity
}));

import { encodeApprovalsCursorToken } from "./approvals-cursor";
import { executeChannelCommand } from "./execute";

const OWNER_ID = "00000000-0000-4000-a000-000000000001";
const OWNER_AGENT_ID = "00000000-0000-4000-a000-000000000002";
const OTHER_AGENT_ID = "00000000-0000-4000-a000-000000000003";
const APPROVAL_ID = "00000000-0000-4000-a000-000000000004";
const TARGET_ID = "00000000-0000-4000-a000-000000000005";
const THREAD_ID = "00000000-0000-4000-a000-000000000006";
const TRANSACTION_ID = "00000000-0000-4000-a000-000000000007";

const channel = {
  channelType: "telegram",
  channelUserId: "telegram-user",
  channelContextId: "telegram-chat",
  displayName: "Test owner"
};

function identity(role = "owner") {
  return {
    channel_identity_id: "channel-identity-1",
    owner_id: OWNER_ID,
    role,
    state: "PAIRED"
  };
}

function run(command: Record<string, unknown>, ctx: any = {}) {
  return executeChannelCommand({
    channel,
    command: command as any,
    ctx
  });
}

describe("executeChannelCommand behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findActiveIdentityByChannel.mockResolvedValue(identity());
    mocks.findPendingIdentityByChannel.mockResolvedValue(null);
    mocks.touchLastSeen.mockResolvedValue(undefined);
    mocks.getPolicyOrDefault.mockResolvedValue({ version: 7, policy_json: { mode: "safe" } });
    mocks.getAgentIdByOwnerId.mockResolvedValue(OWNER_AGENT_ID);
    mocks.listWatchlistsPage.mockResolvedValue({
      items: [],
      page: 0,
      pageSize: 8,
      hasPrev: false,
      hasNext: false
    });
    mocks.listApprovals.mockResolvedValue({ approvals: [], nextCursor: null });
    mocks.getApprovalForOwner.mockResolvedValue(null);
    mocks.resolveApproval.mockResolvedValue({ approval_id: APPROVAL_ID, state: "APPROVED" });
    mocks.getOpsStatusSnapshot.mockReturnValue({
      env: "test",
      commit_sha: "deadbeef",
      now: "2026-07-23T12:00:00.000Z"
    });
    mocks.createPairToken.mockResolvedValue({
      pair_token: "pair-token",
      expires_at: "2026-07-23T12:30:00.000Z"
    });
    mocks.consumePairToken.mockResolvedValue({ owner_id: OWNER_ID });
    mocks.pairChannelIdentityForOwner.mockResolvedValue({
      state: "PAIRED",
      identity: identity()
    });
    mocks.rateLimitMiddleware.mockResolvedValue(null);
    mocks.getOrCreateNotificationPreferences.mockResolvedValue({
      mode: "DIGEST_HOURLY",
      timezone: "Europe/Paris",
      quiet_enabled: true,
      quiet_start_min: 22 * 60,
      quiet_end_min: 8 * 60,
      event_types: ["watchlist_match"],
      filters: { strong: { max_price_eur: 500, min_seller_trust_score: 80 } }
    });
    mocks.updateNotificationPreferences.mockImplementation(async ({ patch }: any) => ({
      mode: "DIGEST_HOURLY",
      timezone: "Europe/Paris",
      event_types: ["watchlist_match"],
      ...patch
    }));
    mocks.buildNotificationsKeyboard.mockReturnValue({ inline_keyboard: [] });
    mocks.createConfirmation.mockResolvedValue({ ok: true });
    mocks.consumeConfirmation.mockResolvedValue({ ok: true });
    mocks.getTransaction.mockResolvedValue({
      transaction_id: TRANSACTION_ID,
      listing_id: TARGET_ID,
      thread_id: THREAD_ID
    });
    mocks.createMessage.mockResolvedValue({ message_id: "message-1" });
    mocks.createOrGetControlDmThread.mockResolvedValue({
      thread: { thread_id: THREAD_ID }
    });
    mocks.clearActiveListingDraftForChannel.mockResolvedValue(undefined);
    mocks.cancelStagedCommandsForChannelIdentity.mockResolvedValue(undefined);
  });

  it("serves public help, unknown, start and connect entrypoints", async () => {
    expect((await run({ kind: "help" })).card?.title).toBe("Help");
    expect((await run({ kind: "unknown" })).text).toContain("Commands:");
    expect((await run({ kind: "start", pairToken: null })).text).toContain("Pairing:");

    const ctx: any = {};
    const paired = await run({ kind: "start", pairToken: "pair-token" }, ctx);
    expect(paired.text).toBe("Paired: PAIRED");
    expect(ctx).toMatchObject({
      ownerId: OWNER_ID,
      actor: { type: "owner", id: OWNER_ID },
      policy: { action: "channel.pair", state: "PAIRED" }
    });

    mocks.pairChannelIdentityForOwner.mockResolvedValueOnce({
      state: "PENDING_APPROVAL",
      identity: { ...identity(), state: "PENDING_APPROVAL" }
    });
    expect((await run({ kind: "start", pairToken: "pair-token" })).text).toContain("PENDING_APPROVAL");

    const connect = await run({ kind: "connect" });
    expect(connect.text).toContain("Connect your Clawdeals account:");
    expect(connect.replyMarkup.inline_keyboard[0][0].url).toContain("/pair?token=pair-token");
  });

  it("maps every pairing-token failure without leaking internals", async () => {
    mocks.consumePairToken.mockResolvedValueOnce({});
    expect((await run({ kind: "start", pairToken: "missing-owner" })).text).toContain("PAIR_TOKEN_INVALID");

    for (const code of [
      "PAIR_TOKEN_EXPIRED",
      "PAIR_TOKEN_USED",
      "PAIR_TOKEN_INVALID",
      "CHANNEL_ALREADY_PAIRED"
    ]) {
      mocks.consumePairToken.mockRejectedValueOnce({ code, message: "internal detail" });
      expect((await run({ kind: "start", pairToken: code })).text).toContain(code);
    }

    mocks.consumePairToken.mockRejectedValueOnce(new Error("pairing backend unavailable"));
    expect((await run({ kind: "start", pairToken: "backend" })).text).toBe(
      "Error: pairing backend unavailable"
    );
  });

  it("blocks unpaired and pending channels before command execution", async () => {
    mocks.findActiveIdentityByChannel.mockResolvedValue(null);
    expect((await run({ kind: "status" })).text).toContain("CHANNEL_NOT_PAIRED");

    mocks.findPendingIdentityByChannel.mockResolvedValueOnce({
      ...identity(),
      state: "PENDING_APPROVAL"
    });
    const pending = await run({ kind: "status" });
    expect(pending.blocked).toBe(true);
    expect(pending.text).toContain("pairing is pending approval");
  });

  it("resets best-effort state and preserves security context", async () => {
    mocks.clearActiveListingDraftForChannel.mockRejectedValueOnce(new Error("draft cleanup failed"));
    mocks.cancelStagedCommandsForChannelIdentity.mockRejectedValueOnce(new Error("staged cleanup failed"));
    const ctx: any = { security: { request_id: "request-1" } };

    const result = await run({ kind: "reset" }, ctx);
    expect(result.card?.title).toBe("Reset");
    expect(result.text).toContain("Nothing was deleted");
    expect(ctx.security).toEqual({
      request_id: "request-1",
      channel_identity_id: "channel-identity-1",
      role: "owner"
    });
  });

  it("renders every navigation card and watchlist pagination variant", async () => {
    const menuCtx: any = {};
    expect((await run({ kind: "menu" }, menuCtx)).card?.title).toBe("Clawdeals");
    expect(menuCtx.policy).toMatchObject({ action: "chat.menu", policy_version: 7 });

    mocks.listWatchlistsPage.mockResolvedValueOnce({
      items: [
        { active: true, name: "GPU", query_text: "RTX", price_max: 500 },
        { active: false, name: " ", query_text: " ", price_max: "invalid" }
      ],
      page: 2,
      pageSize: 8,
      hasPrev: true,
      hasNext: true
    });
    const watchlists = await run({ kind: "menu_watchlists", page: -4 });
    expect(watchlists.card?.title).toBe("Watchlists");
    expect(watchlists.text).toContain("ON: GPU | q=RTX | max=500EUR");
    expect(watchlists.text).toContain("OFF: (sans nom)");
    expect(watchlists.card?.actions.map((action: any) => action.label)).toEqual(
      expect.arrayContaining(["Prec", "Suiv"])
    );

    mocks.getAgentIdByOwnerId.mockResolvedValueOnce(null);
    expect((await run({ kind: "menu_watchlists", page: 0 })).text).toContain("missing agent");

    expect((await run({ kind: "watchlists_create" })).card?.title).toBe("Creer une watchlist");
    expect((await run({ kind: "menu_matches" })).card?.title).toBe("Matches / alertes");
    expect((await run({ kind: "menu_publish" })).card?.title).toBe("Publier une annonce");
    expect((await run({ kind: "menu_threads" })).card?.title).toBe("Mes threads / negociations");
    const help = await run({ kind: "menu_help" });
    expect(help.card?.actions.some((action: any) => action.action_id === "help.back")).toBe(true);
  });

  it("enforces owner and approver roles at mutation boundaries", async () => {
    mocks.findActiveIdentityByChannel.mockResolvedValue(identity("viewer"));
    for (const command of [
      { kind: "reset" },
      { kind: "watchlists_create" },
      { kind: "menu_publish" },
      { kind: "policies_show" },
      { kind: "unpair", channelIdentityId: TARGET_ID, confirm: false },
      { kind: "approve", approvalId: APPROVAL_ID, confirm: false },
      { kind: "deny", approvalId: APPROVAL_ID, confirm: false }
    ]) {
      expect((await run(command)).text).toContain("Forbidden:");
    }

    mocks.findActiveIdentityByChannel.mockResolvedValue(identity("approver"));
    expect((await run({ kind: "approve", approvalId: "invalid", confirm: false })).text).toBe(
      "Invalid approval_id"
    );
    expect((await run({ kind: "deny", approvalId: "invalid", confirm: false })).text).toBe(
      "Invalid approval_id"
    );
  });

  it("reads and updates all notification preference shapes", async () => {
    const menu = await run({ kind: "notifications_menu" });
    expect(menu.text).toContain("quiet hours: ON (22:00-08:00)");
    expect(menu.text).toContain("strong: price<=500EUR OR trust>=80");

    const cases = [
      [{ kind: "notifications_mode", mode: "SILENT" }, { mode: "SILENT" }],
      [
        { kind: "notifications_quiet_off" },
        { quiet_enabled: false, quiet_start_min: null, quiet_end_min: null }
      ],
      [
        { kind: "notifications_quiet_set", start: "22:30", end: "8:05" },
        { quiet_enabled: true, quiet_start_min: 1350, quiet_end_min: 485 }
      ],
      [{ kind: "notifications_tz", timezone: "UTC" }, { timezone: "UTC" }],
      [
        { kind: "notifications_types_toggle", eventType: "approval_required" },
        { event_types: ["watchlist_match", "approval_required"] }
      ],
      [
        { kind: "notifications_types_toggle", eventType: "watchlist_match" },
        { event_types: [] }
      ],
      [
        { kind: "notifications_strong_price", maxPriceEur: null },
        { filters: { strong: { max_price_eur: null, min_seller_trust_score: 80 } } }
      ],
      [
        { kind: "notifications_strong_trust", minSellerTrustScore: 95 },
        { filters: { strong: { max_price_eur: 500, min_seller_trust_score: 95 } } }
      ]
    ] as const;

    for (const [command, patch] of cases) {
      mocks.updateNotificationPreferences.mockClear();
      await run(command);
      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        patch
      });
    }

    expect((await run({
      kind: "notifications_quiet_set",
      start: "24:00",
      end: "08:99"
    })).text).toContain("Invalid quiet hours");
    expect((await run({
      kind: "notifications_types_toggle",
      eventType: "unknown"
    })).text).toContain("Invalid event type");
  });

  it("rate-limits notification writes but fails open on limiter errors", async () => {
    mocks.rateLimitMiddleware.mockResolvedValueOnce({ status: 429 });
    expect((await run({ kind: "notifications_mode", mode: "SILENT" })).text).toContain("Rate limited");
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();

    mocks.rateLimitMiddleware.mockRejectedValueOnce(new Error("limiter unavailable"));
    await run({ kind: "notifications_mode", mode: "REALTIME" });
    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      patch: { mode: "REALTIME" }
    });
  });

  it("renders status, deployment and policy diagnostics", async () => {
    mocks.listApprovals.mockResolvedValueOnce({
      approvals: [
        { approval_id: "approval-1", action_type: "offer.accept" },
        { approval_id: "approval-2", action_type: "listing_publish" }
      ]
    });
    const status = await run({ kind: "status" });
    expect(status.text).toContain("pending approvals: 2");
    expect(status.text).toContain("approval-1 offer.accept");

    const deployment = await run({ kind: "deploy_status" });
    expect(deployment.text).toContain("commit: deadbeef");

    const policy = await run({ kind: "policies_show" });
    expect(policy.text).toContain("\"mode\": \"safe\"");
  });

  it("formats approval cards across risks, contexts and redacted reasons", async () => {
    mocks.listApprovals.mockResolvedValue({
      approvals: [
        {
          approval_id: APPROVAL_ID,
          owner_id: OWNER_ID,
          action_type: "offer_over_budget",
          action_ref: {
            amount: 450,
            currency: "EUR",
            listing_id: TARGET_ID,
            thread_id: THREAD_ID,
            quarantine_applied: true
          },
          created_at: "2026-07-23T12:00:00.000Z"
        },
        {
          approval_id: "approval-contact",
          action_type: "contact_reveal",
          action_ref_id: TRANSACTION_ID,
          action_ref: { policy_reason: "manual review" },
          created_at: "2026-07-23T11:59:00.000Z"
        },
        {
          approval_id: "approval-scopes",
          action_type: "scopes.upgrade",
          action_ref_id: TARGET_ID,
          action_payload_redacted: {
            requested_scopes: ["deals:write", "transactions:write", "escrow:write"],
            policy: { reason: "privileged scopes" }
          },
          created_at: "2026-07-23T11:58:00.000Z"
        }
      ],
      nextCursor: "database-cursor"
    });

    const ctx: any = {};
    const page = await run({ kind: "menu_approvals" }, ctx);
    expect(page.card?.title).toBe("Approvals");
    expect(page.text).toContain("Offer 450 EUR");
    expect(page.text).toContain("Contact reveal");
    expect(page.text).toContain("Scope upgrade (3)");
    expect(page.text).toContain("quarantine_applied");
    expect(ctx.policy).toMatchObject({ action: "chat.approvals", policy_version: 7 });

    const cursor = encodeApprovalsCursorToken({
      createdAt: "2026-07-23T12:00:00.000Z",
      approvalId: APPROVAL_ID
    });
    await run({ kind: "approvals_page", cursor });
    expect(mocks.listApprovals).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: {
        created_at: "2026-07-23T12:00:00.000000Z",
        approval_id: APPROVAL_ID
      }
    }));
    expect((await run({ kind: "approvals_page", cursor: "invalid" })).text).toContain("Invalid cursor");
  });

  it("handles step-up confirmation expiry, races and successful resolution", async () => {
    mocks.findActiveIdentityByChannel.mockResolvedValue(identity("approver"));
    mocks.consumeConfirmation.mockResolvedValueOnce(null);
    expect((await run({ kind: "confirm", code: "ABC123" })).text).toContain("Expired");
    expect((await run({ kind: "confirm", code: " " })).text).toContain("Invalid code");

    mocks.consumeConfirmation.mockResolvedValueOnce({
      approvalId: APPROVAL_ID,
      decision: "APPROVED"
    });
    mocks.getApprovalForOwner.mockResolvedValueOnce(null);
    expect((await run({ kind: "confirm", code: "ABC123" })).text).toContain("Approval not found");

    mocks.consumeConfirmation.mockResolvedValueOnce({
      approvalId: APPROVAL_ID,
      decision: "DENIED"
    });
    mocks.getApprovalForOwner.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      state: "APPROVED"
    });
    expect((await run({ kind: "confirm", code: "ABC123" })).text).toContain("Already resolved");

    mocks.consumeConfirmation.mockResolvedValueOnce({
      approvalId: APPROVAL_ID,
      decision: "DENIED"
    });
    mocks.getApprovalForOwner.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      owner_id: OWNER_ID,
      state: "PENDING",
      action_type: "escrow.create",
      action_ref_id: TRANSACTION_ID,
      created_by_agent_id: OWNER_AGENT_ID
    });
    mocks.resolveApproval.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      state: "DENIED"
    });
    const resolved = await run({ kind: "confirm", code: "ABC123" });
    expect(resolved.text).toContain("Denied:");
    expect(mocks.resolveApproval).toHaveBeenCalledWith(expect.objectContaining({
      decision: "DENIED"
    }));
  });

  it("uses two-step unpair confirmation and exact owner scoping", async () => {
    expect((await run({
      kind: "unpair",
      channelIdentityId: "invalid",
      confirm: false
    })).text).toBe("Invalid channel_identity_id");

    const requested = await run({
      kind: "unpair",
      channelIdentityId: TARGET_ID,
      confirm: false
    });
    expect(requested.text).toContain("Unpair requested");
    expect(mocks.createConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      action: "unpair",
      targetId: TARGET_ID
    }));

    mocks.consumeConfirmation.mockResolvedValueOnce(null);
    expect((await run({
      kind: "unpair",
      channelIdentityId: TARGET_ID,
      confirm: true
    })).text).toContain("No pending confirmation");

    mocks.consumeConfirmation.mockResolvedValueOnce({ targetId: TARGET_ID });
    expect((await run({
      kind: "unpair",
      channelIdentityId: TARGET_ID,
      confirm: true
    })).text).toBe(`Unpaired: ${TARGET_ID}`);
    expect(mocks.revokePairing).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      channelIdentityId: TARGET_ID,
      revokedBy: OWNER_ID
    });
  });

  it("supports typed approve and deny confirmation lifecycles", async () => {
    mocks.findActiveIdentityByChannel.mockResolvedValue(identity("approver"));
    const pendingApproval = {
      approval_id: APPROVAL_ID,
      owner_id: OWNER_ID,
      state: "PENDING",
      action_type: "listing_publish"
    };

    mocks.getApprovalForOwner.mockResolvedValueOnce(null);
    expect((await run({
      kind: "approve",
      approvalId: APPROVAL_ID,
      confirm: false
    })).text).toBe("Approval not found");

    mocks.getApprovalForOwner.mockResolvedValueOnce(pendingApproval);
    expect((await run({
      kind: "approve",
      approvalId: APPROVAL_ID,
      confirm: false
    })).text).toContain("Approve requested");

    mocks.consumeConfirmation.mockResolvedValueOnce(null);
    expect((await run({
      kind: "approve",
      approvalId: APPROVAL_ID,
      confirm: true
    })).text).toContain("No pending confirmation");

    mocks.consumeConfirmation.mockResolvedValueOnce({ approvalId: APPROVAL_ID });
    mocks.getApprovalForOwner.mockResolvedValueOnce(pendingApproval);
    mocks.resolveApproval.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      state: "APPROVED"
    });
    expect((await run({
      kind: "approve",
      approvalId: APPROVAL_ID,
      confirm: true
    })).text).toBe(`Approved: ${APPROVAL_ID}`);

    mocks.getApprovalForOwner.mockResolvedValueOnce(pendingApproval);
    expect((await run({
      kind: "deny",
      approvalId: APPROVAL_ID,
      confirm: false,
      reason: "unsafe"
    })).text).toContain("reason: unsafe");

    mocks.consumeConfirmation.mockResolvedValueOnce({
      approvalId: APPROVAL_ID,
      reason: "stored reason"
    });
    mocks.getApprovalForOwner.mockResolvedValueOnce(pendingApproval);
    mocks.resolveApproval.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      state: "DENIED"
    });
    expect((await run({
      kind: "deny",
      approvalId: APPROVAL_ID,
      confirm: true,
      reason: null
    })).text).toContain("reason: stored reason");
  });

  it("resolves low-risk callbacks immediately and requires step-up for high risk", async () => {
    mocks.findActiveIdentityByChannel.mockResolvedValue(identity("approver"));
    const callbackCtx = { body: { telegram: { callback_query_id: "callback-1" } } };

    mocks.getApprovalForOwner.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      owner_id: OWNER_ID,
      state: "PENDING",
      action_type: "message.send",
      created_by_agent_id: OTHER_AGENT_ID,
      action_ref: { thread_id: THREAD_ID, message_type: "text" }
    });
    const approved = await run({
      kind: "approve",
      approvalId: APPROVAL_ID,
      confirm: false
    }, callbackCtx);
    expect(approved.text).toContain("Approved:");
    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: THREAD_ID,
      type: "info"
    }));

    mocks.getApprovalForOwner.mockResolvedValueOnce({
      approval_id: APPROVAL_ID,
      owner_id: OWNER_ID,
      state: "PENDING",
      action_type: "contact_reveal",
      created_by_agent_id: OTHER_AGENT_ID,
      action_ref_id: TRANSACTION_ID
    });
    const highRisk = await run({
      kind: "deny",
      approvalId: APPROVAL_ID,
      confirm: false
    }, callbackCtx);
    expect(highRisk.card?.title).toBe("Confirmation required");
    expect(highRisk.text).toContain("CONFIRM");
    expect(mocks.createConfirmation).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "approvals.stepup",
      payload: { approvalId: APPROVAL_ID, decision: "DENIED" }
    }));
  });

  it("falls back to help for authenticated unsupported commands", async () => {
    const result = await run({ kind: "future_command" });
    expect(result.text).toContain("Commands:");
    expect(result.identity).toMatchObject({ owner_id: OWNER_ID });
  });
});
