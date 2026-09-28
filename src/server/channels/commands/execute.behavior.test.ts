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

import { executeChannelCommand } from "./execute";

const OWNER_ID = "00000000-0000-4000-a000-000000000001";
const OWNER_AGENT_ID = "00000000-0000-4000-a000-000000000002";
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
});
