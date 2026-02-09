import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/utils/channel-fingerprint", () => ({
  createChannelFingerprints: vi.fn(() => ({
    channel_user_id_hash: "hash-user",
    channel_context_id_hash: "hash-context"
  }))
}));

vi.mock("../../../../server/audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

vi.mock("../../../../server/services/channel-identities", () => ({
  startPairing: vi.fn(),
  findActiveIdentity: vi.fn(),
  touchLastSeen: vi.fn(),
  revokePairing: vi.fn(),
}));

vi.mock("../../../../server/services/approvals", () => ({
  listApprovals: vi.fn(),
  getApprovalForOwner: vi.fn(),
  resolveApproval: vi.fn()
}));

vi.mock("../../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn()
}));

vi.mock("../../../../server/channels/command-confirmations", () => ({
  createConfirmation: vi.fn(async () => ({ ok: true })),
  consumeConfirmation: vi.fn(async () => ({ approvalId: "x" }))
}));

import { handler } from "../../../../pages/api/v1/channels/telegram/webhook";
import { safeAuditLog } from "../../../../server/audit/singleton";
import {
  startPairing,
  findActiveIdentity,
  touchLastSeen
} from "../../../../server/services/channel-identities";
import { listApprovals, getApprovalForOwner, resolveApproval } from "../../../../server/services/approvals";
import { createConfirmation, consumeConfirmation } from "../../../../server/channels/command-confirmations";

const APPROVAL_ID = "00000000-0000-4000-a000-000000000123";

function makeCtx() {
  return {
    authError: null,
    ip: "127.0.0.1",
    requestId: "req-1",
    userAgent: "ua",
    method: "POST",
    path: "/api/v1/channels/telegram/webhook",
    query: {},
    actor: { type: "anonymous", id: null },
    agentId: null,
    ownerId: null,
    apiKeyId: null,
    apiKeyState: null,
    security: null,
    policy: null,
    idempotency: null,
    rateLimit: null,
    auditEvent: null,
    outcome: null
  };
}

function makeReq(text: string) {
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secret" },
    body: {
      update_id: 1,
      message: {
        message_id: 1,
        text,
        from: { id: 123, username: "alice" },
        chat: { id: 456, type: "private" }
      }
    }
  };
}

describe("POST /api/v1/channels/telegram/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN = "secret";
  });

  it("blocks when not allowlisted (suggests pair)", async () => {
    vi.mocked(findActiveIdentity).mockResolvedValue(null as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("status"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/not allowlisted/i);
    expect(result.body.text).toMatch(/\bpair\b/i);
    expect(ctx.auditEvent).toBe("channel.command_received");
    expect(ctx.outcome?.type).toBe("BLOCKED");
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "command.blocked_not_allowlisted" })
    }));
  });

  it("pair returns a code and emits pairing.started", async () => {
    vi.mocked(startPairing).mockResolvedValue({
      identity: { channel_identity_id: "cid-1", state: "PENDING" },
      code: "CD-AAAAAA",
      expiresAt: new Date("2026-02-09T12:00:00Z"),
      alreadyActive: false
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("pair"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/CD-AAAAAA/);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "pairing.started" })
    }));
  });

  it("allowlisted viewer can run status", async () => {
    vi.mocked(findActiveIdentity).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "viewer",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);
    vi.mocked(listApprovals).mockResolvedValue({ approvals: [], nextCursor: null } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("status"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/CLAWDEALS status/);
    expect(ctx.ownerId).toBe("owner-1");
    expect(ctx.actor).toEqual({ type: "owner", id: "owner-1" });
  });

  it("approver approve flow requires confirm and confirm resolves", async () => {
    vi.mocked(findActiveIdentity).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "approver",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);

    vi.mocked(getApprovalForOwner).mockResolvedValue({
      approval_id: APPROVAL_ID,
      owner_id: "owner-1",
      state: "PENDING",
      action_type: "listing_publish",
      action_ref_id: "listing-1"
    } as any);

    vi.mocked(createConfirmation).mockResolvedValue({ ok: true } as any);

    const ctx1 = makeCtx();
    const step1: any = await handler(makeReq(`approve ${APPROVAL_ID}`), null, ctx1);
    expect(step1.status).toBe(200);
    expect(step1.body.text).toMatch(/Confirm with: approve/i);

    vi.mocked(consumeConfirmation).mockResolvedValue({ approvalId: APPROVAL_ID } as any);
    vi.mocked(resolveApproval).mockResolvedValue({ approval_id: APPROVAL_ID, state: "APPROVED" } as any);

    const ctx2 = makeCtx();
    const step2: any = await handler(makeReq(`approve ${APPROVAL_ID} confirm`), null, ctx2);
    expect(step2.status).toBe(200);
    expect(step2.body.text).toMatch(/Approved:/);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "approval.resolved" })
    }));
  });
});
