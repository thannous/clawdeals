import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../services/channel-identities", () => ({
  findActiveIdentityByChannel: vi.fn(async () => ({
    channel_identity_id: "cid-1",
    owner_id: "owner-1",
    role: "owner",
    state: "PAIRED"
  })),
  findPendingIdentityByChannel: vi.fn(async () => null),
  revokePairing: vi.fn(async () => null),
  touchLastSeen: vi.fn(async () => null)
}));

vi.mock("../../services/policies", () => ({
  getPolicyOrDefault: vi.fn(async () => ({ version: 1, policy_json: {} }))
}));

vi.mock("../../services/agents", () => ({
  getAgentIdByOwnerId: vi.fn(async () => "agent-1")
}));

vi.mock("../../services/watchlists", () => ({
  listWatchlistsPage: vi.fn(async () => ({
    items: [{ watchlist_id: "w1", active: true, name: "GPU", query_text: "rtx", price_max: 500 }],
    page: 0,
    pageSize: 8,
    hasPrev: false,
    hasNext: true
  }))
}));

vi.mock("../../services/approvals", () => ({
  listApprovals: vi.fn(async () => ({ approvals: [] })),
  getApprovalForOwner: vi.fn(async () => null),
  resolveApproval: vi.fn(async () => null)
}));

vi.mock("../../services/ops-status", () => ({
  getOpsStatusSnapshot: vi.fn(() => ({ env: "test", commit_sha: "deadbeef", now: "now" }))
}));

vi.mock("../../services/pairing-tokens", () => ({
  createPairToken: vi.fn(async () => ({ pair_token: "token", expires_at: new Date().toISOString() })),
  consumePairToken: vi.fn(async () => ({ owner_id: "owner-1" }))
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

import { findActiveIdentityByChannel } from "../../services/channel-identities";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences
} from "../../services/notification-preferences";
import { executeChannelCommand } from "./execute";

const findActiveIdentityByChannelMock = vi.mocked(findActiveIdentityByChannel);
const getOrCreateNotificationPreferencesMock = vi.mocked(getOrCreateNotificationPreferences);
const updateNotificationPreferencesMock = vi.mocked(updateNotificationPreferences);

describe("executeChannelCommand (menu cards)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Home card with required actions", async () => {
    const res = await executeChannelCommand({
      channel: { channelType: "telegram", channelUserId: "u1", channelContextId: "c1", displayName: "u" },
      command: { kind: "menu" } as any,
      ctx: {}
    });

    expect(res.card?.title).toBe("Clawdeals");
    const labels = (res.card?.actions || []).map((a: any) => a.label);
    expect(labels).toEqual([
      "Watchlists",
      "Matches / alertes",
      "Publier une annonce",
      "Mes threads / negociations",
      "Approvals",
      "Notifications",
      "Help"
    ]);
    expect(res.telemetryEvents?.some((e) => e.event === "chat.menu_opened")).toBe(true);
    expect(res.telemetryEvents?.some((e) => e.event === "chat.card_rendered")).toBe(true);
  });

  it("returns a Watchlists card with pagination controls", async () => {
    const res = await executeChannelCommand({
      channel: { channelType: "telegram", channelUserId: "u1", channelContextId: "c1", displayName: "u" },
      command: { kind: "menu_watchlists", page: 0 } as any,
      ctx: {}
    });

    expect(res.card?.title).toBe("Watchlists");
    const actionIds = (res.card?.actions || []).map((a: any) => a.action_id);
    expect(actionIds).toContain("watchlists.next");
    expect(actionIds).toContain("watchlists.back");
    expect(actionIds).toContain("watchlists.create");
  });

  it("allows viewers to read notification preferences", async () => {
    findActiveIdentityByChannelMock.mockResolvedValueOnce({
      channel_identity_id: "cid-viewer",
      owner_id: "owner-1",
      role: "viewer",
      state: "PAIRED"
    } as any);

    const result = await executeChannelCommand({
      channel: { channelType: "telegram", channelUserId: "u1", channelContextId: "c1", displayName: "u" },
      command: { kind: "notifications_menu" } as any,
      ctx: {}
    });

    expect(result.text).not.toContain("Forbidden");
    expect(getOrCreateNotificationPreferencesMock).toHaveBeenCalledTimes(1);
    expect(updateNotificationPreferencesMock).not.toHaveBeenCalled();
  });

  it("blocks viewers from mutating owner notification preferences", async () => {
    findActiveIdentityByChannelMock.mockResolvedValueOnce({
      channel_identity_id: "cid-viewer",
      owner_id: "owner-1",
      role: "viewer",
      state: "PAIRED"
    } as any);

    const result = await executeChannelCommand({
      channel: { channelType: "telegram", channelUserId: "u1", channelContextId: "c1", displayName: "u" },
      command: { kind: "notifications_mode", mode: "SILENT" } as any,
      ctx: {}
    });

    expect(result.text).toBe("Forbidden: owner role required.");
    expect(getOrCreateNotificationPreferencesMock).not.toHaveBeenCalled();
    expect(updateNotificationPreferencesMock).not.toHaveBeenCalled();
  });

  it("preserves owner notification preference updates", async () => {
    const result = await executeChannelCommand({
      channel: { channelType: "telegram", channelUserId: "u1", channelContextId: "c1", displayName: "u" },
      command: { kind: "notifications_mode", mode: "SILENT" } as any,
      ctx: {}
    });

    expect(result.text).not.toContain("Forbidden");
    expect(updateNotificationPreferencesMock).toHaveBeenCalledWith({
      ownerId: "owner-1",
      patch: { mode: "SILENT" }
    });
  });
});
