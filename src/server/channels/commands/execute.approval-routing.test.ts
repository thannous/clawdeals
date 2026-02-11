import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "00000000-0000-4000-a000-000000000001";
const OWNER_AGENT_ID = "00000000-0000-4000-a000-000000000002";
const COUNTERPARTY_AGENT_ID = "00000000-0000-4000-a000-000000000003";
const APPROVAL_ID = "00000000-0000-4000-a000-000000000004";
const MARKET_THREAD_ID = "00000000-0000-4000-a000-000000000005";
const CONTROL_THREAD_ID = "00000000-0000-4000-a000-000000000006";

vi.mock("../../services/channel-identities", () => ({
  findActiveIdentityByChannel: vi.fn(),
  findPendingIdentityByChannel: vi.fn(async () => null),
  revokePairing: vi.fn(async () => null),
  touchLastSeen: vi.fn(async () => null)
}));

vi.mock("../../services/policies", () => ({
  getPolicyOrDefault: vi.fn(async () => ({ version: 1, policy_json: {} }))
}));

vi.mock("../../services/agents", () => ({
  getAgentIdByOwnerId: vi.fn()
}));

vi.mock("../../services/watchlists", () => ({
  listWatchlistsPage: vi.fn(async () => ({ items: [], page: 0, pageSize: 8, hasPrev: false, hasNext: false }))
}));

vi.mock("../../services/approvals", () => ({
  listApprovals: vi.fn(async () => ({ approvals: [], hasNext: false })),
  getApprovalForOwner: vi.fn(),
  resolveApproval: vi.fn()
}));

vi.mock("../../services/ops-status", () => ({
  getOpsStatusSnapshot: vi.fn(() => ({ env: "test", commit_sha: "deadbeef", now: "now" }))
}));

vi.mock("../../services/pairing-tokens", () => ({
  createPairToken: vi.fn(async () => ({ pair_token: "token", expires_at: new Date().toISOString() })),
  consumePairToken: vi.fn(async () => ({ owner_id: OWNER_ID }))
}));

vi.mock("../../services/channel-pairing", () => ({
  pairChannelIdentityForOwner: vi.fn(async () => ({ state: "PAIRED", identity: { channel_identity_id: "cid-1" } }))
}));

vi.mock("../../rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn(async () => null)
}));

vi.mock("../../services/notification-preferences", () => ({
  getOrCreateNotificationPreferences: vi.fn(async () => ({})),
  updateNotificationPreferences: vi.fn(async () => ({})),
  NOTIFICATION_EVENT_TYPES: ["watchlist_match"]
}));

vi.mock("../telegram/keyboard", () => ({
  buildNotificationsKeyboard: vi.fn(() => ({ inline_keyboard: [] }))
}));

vi.mock("../command-confirmations", () => ({
  createConfirmation: vi.fn(async () => ({ ok: true })),
  consumeConfirmation: vi.fn(async () => ({ ok: true }))
}));

vi.mock("../../services/transactions", () => ({
  getTransaction: vi.fn()
}));

vi.mock("../../services/threads", () => ({
  createMessage: vi.fn(async () => ({ message_id: "msg-1" })),
  createOrGetControlDmThread: vi.fn()
}));

import { executeChannelCommand } from "./execute";
import { getAgentIdByOwnerId } from "../../services/agents";
import { getApprovalForOwner, resolveApproval } from "../../services/approvals";
import { findActiveIdentityByChannel, touchLastSeen } from "../../services/channel-identities";
import { createMessage, createOrGetControlDmThread } from "../../services/threads";

async function runApprovalCallback(approval: any) {
  vi.mocked(getApprovalForOwner).mockResolvedValue(approval);
  return executeChannelCommand({
    channel: { channelType: "telegram", channelUserId: "u1", channelContextId: "c1", displayName: "user" },
    command: { kind: "approve", approvalId: APPROVAL_ID, confirm: false } as any,
    ctx: { body: { telegram: { callback_query_id: "cb-1" } } }
  });
}

describe("executeChannelCommand approval routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: OWNER_ID,
      role: "approver",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);

    vi.mocked(getAgentIdByOwnerId).mockResolvedValue(OWNER_AGENT_ID);
    vi.mocked(resolveApproval).mockResolvedValue({ approval_id: APPROVAL_ID, state: "APPROVED" } as any);
    vi.mocked(createOrGetControlDmThread).mockResolvedValue({
      thread: { thread_id: CONTROL_THREAD_ID }
    } as any);
  });

  it("falls back to marketplace thread when approval actor agent is not the owner's agent", async () => {
    await runApprovalCallback({
      approval_id: APPROVAL_ID,
      owner_id: OWNER_ID,
      state: "PENDING",
      action_type: "offer_over_budget",
      created_by_agent_id: COUNTERPARTY_AGENT_ID,
      action_ref: { thread_id: MARKET_THREAD_ID }
    });

    expect(createOrGetControlDmThread).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createMessage).mock.calls[0]?.[0]?.threadId).toBe(MARKET_THREAD_ID);
  });

  it("uses control-dm when approval actor agent matches the owner's bound agent", async () => {
    await runApprovalCallback({
      approval_id: APPROVAL_ID,
      owner_id: OWNER_ID,
      state: "PENDING",
      action_type: "message.send",
      created_by_agent_id: OWNER_AGENT_ID,
      action_ref: { thread_id: MARKET_THREAD_ID }
    });

    expect(createOrGetControlDmThread).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      agentId: OWNER_AGENT_ID
    });
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createMessage).mock.calls[0]?.[0]?.threadId).toBe(CONTROL_THREAD_ID);
  });
});
