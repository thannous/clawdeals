import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/channel-identities", () => ({
  listChannelIdentities: vi.fn(),
  confirmPairingCode: vi.fn(),
  getChannelIdentity: vi.fn(),
  approvePairing: vi.fn(),
  denyPairing: vi.fn(),
  revokePairing: vi.fn()
}));

vi.mock("../../../server/utils/channel-fingerprint", () => ({
  createChannelFingerprints: vi.fn(() => ({
    channel_user_id_hash: "hash-user",
    channel_context_id_hash: "hash-context"
  }))
}));

import { handler as listHandler } from "../../../pages/api/console/channels";
import { handler as confirmHandler } from "../../../pages/api/console/channels/confirm";
import { handler as idHandler } from "../../../pages/api/console/channels/[channel_identity_id]";
import {
  listChannelIdentities,
  confirmPairingCode,
  getChannelIdentity,
  approvePairing,
  denyPairing,
  revokePairing
} from "../../../server/services/channel-identities";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("/api/console/channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sanitized items", async () => {
    vi.mocked(listChannelIdentities).mockResolvedValue([
      {
        channel_identity_id: "cid-1",
        channel_type: "telegram",
        channel_user_id: "123",
        channel_context_id: "",
        owner_id: "owner-1",
        role: "viewer",
        state: "PENDING",
        pairing_code_hash: "hash",
        pairing_expires_at: "2026-02-09T12:00:00Z",
        created_at: "2026-02-09T11:00:00Z"
      }
    ] as any);

    const ctx: any = { ...baseCtx };
    const req: any = { method: "GET", query: { state: "PENDING" } };
    const result: any = await listHandler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].channel_identity_id).toBe("cid-1");
    expect(result.body.items[0].channel_user_id).toBeUndefined();
    expect(result.body.items[0].pairing_code_hash).toBeUndefined();
    expect(ctx.auditEvent).toBe("pairings.listed");
  });
});

describe("/api/console/channels/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sanitized identity when confirmed", async () => {
    vi.mocked(confirmPairingCode).mockResolvedValue({
      ok: true,
      identity: {
        channel_identity_id: "cid-1",
        channel_type: "telegram",
        channel_user_id: "123",
        channel_context_id: "",
        pairing_code_hash: "hash",
        state: "PENDING"
      }
    } as any);

    const ctx: any = { ...baseCtx };
    const req: any = { method: "POST", body: { code: "CD-AAAAAA" } };
    const result: any = await confirmHandler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.identity.channel_identity_id).toBe("cid-1");
    expect(result.body.identity.channel_user_id).toBeUndefined();
    expect(result.body.identity.pairing_code_hash).toBeUndefined();
    expect(ctx.auditEvent).toBe("pairing.code_confirmed");
    expect(ctx.security.channel_user_id_hash).toBe("hash-user");
  });
});

describe("/api/console/channels/[channel_identity_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST approve calls service and sanitizes response", async () => {
    vi.mocked(approvePairing).mockResolvedValue({
      channel_identity_id: "cid-1",
      channel_type: "telegram",
      channel_user_id: "123",
      channel_context_id: "",
      pairing_code_hash: null,
      state: "ACTIVE"
    } as any);

    const ctx: any = { ...baseCtx };
    const req: any = {
      method: "POST",
      query: { channel_identity_id: "cid-1" },
      body: { action: "approve", role: "approver" }
    };
    const result: any = await idHandler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("pairing.approved");
    expect(result.body.identity.channel_user_id).toBeUndefined();
  });
});

