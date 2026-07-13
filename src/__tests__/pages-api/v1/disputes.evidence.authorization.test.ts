import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/config/ops", () => ({
  getOpsConsoleOwnerId: vi.fn()
}));

vi.mock("../../../server/services/agents", () => ({
  getAgentById: vi.fn()
}));

vi.mock("../../../server/services/disputes", () => ({
  beginResolveDispute: vi.fn(),
  getDisputeById: vi.fn(),
  rollbackResolveDisputeLock: vi.fn(),
  resolveDispute: vi.fn()
}));

vi.mock("../../../server/services/evidence", () => ({
  confirmEvidenceUpload: vi.fn(),
  getEscrow: vi.fn(),
  initEvidenceUpload: vi.fn(),
  isAllowedEvidenceContentType: vi.fn(() => true),
  isValidSha256Hex: vi.fn(() => true),
  listEvidenceBundle: vi.fn()
}));

vi.mock("../../../server/services/psp-config", () => ({
  getPspConfig: vi.fn()
}));

vi.mock("../../../server/psp", () => ({
  createPspAdapter: vi.fn()
}));

import { handler } from "../../../pages/api/v1/disputes/[dispute_id]/[action]";
import { getOpsConsoleOwnerId } from "../../../server/config/ops";
import { getAgentById } from "../../../server/services/agents";
import { getDisputeById } from "../../../server/services/disputes";
import {
  confirmEvidenceUpload,
  getEscrow,
  initEvidenceUpload,
  listEvidenceBundle
} from "../../../server/services/evidence";
import { getPspConfig } from "../../../server/services/psp-config";

const OPS_OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const BUYER_OWNER_ID = "00000000-0000-4000-8000-0000000000bb";
const BUYER_AGENT_ID = "00000000-0000-4000-8000-0000000000b1";
const SELLER_AGENT_ID = "00000000-0000-4000-8000-0000000000c1";
const OPS_AGENT_ID = "00000000-0000-4000-8000-0000000000a1";
const DISPUTE_ID = "00000000-0000-4000-8000-000000000001";
const ESCROW_ID = "00000000-0000-4000-8000-000000000002";

const getOpsConsoleOwnerIdMock = vi.mocked(getOpsConsoleOwnerId);
const getAgentByIdMock = vi.mocked(getAgentById);
const getDisputeByIdMock = vi.mocked(getDisputeById);
const getEscrowMock = vi.mocked(getEscrow);
const initEvidenceUploadMock = vi.mocked(initEvidenceUpload);
const confirmEvidenceUploadMock = vi.mocked(confirmEvidenceUpload);
const listEvidenceBundleMock = vi.mocked(listEvidenceBundle);
const getPspConfigMock = vi.mocked(getPspConfig);

function request(action: string, method: string, body: any = {}) {
  return {
    method,
    query: { action, dispute_id: DISPUTE_ID },
    headers: method === "POST" ? { "idempotency-key": "test-key" } : {},
    body
  } as any;
}

describe("dispute and evidence actor boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOpsConsoleOwnerIdMock.mockReturnValue(OPS_OWNER_ID);
    getDisputeByIdMock.mockResolvedValue({ dispute_id: DISPUTE_ID, escrow_id: ESCROW_ID } as any);
    getEscrowMock.mockResolvedValue({
      escrow_id: ESCROW_ID,
      buyer_agent_id: BUYER_AGENT_ID,
      seller_agent_id: SELLER_AGENT_ID,
      status: "DISPUTE_OPEN"
    } as any);
    initEvidenceUploadMock.mockResolvedValue({
      upload: { bucket: "evidence", key: "key", url: "https://example.test", expires_in_seconds: 7200 }
    } as any);
    confirmEvidenceUploadMock.mockResolvedValue({ item: { evidence_item_id: "item-id" } } as any);
    listEvidenceBundleMock.mockResolvedValue({
      evidence_pack_id: "pack-id",
      dispute_id: DISPUTE_ID,
      items: [],
      links: [],
      timeline: []
    } as any);
  });

  it("denies dispute resolution to an agent credential owned by the ops owner", async () => {
    const result: any = await handler(
      request("resolve", "POST", { resolution: "REFUND" }),
      null,
      {
        actor: { type: "agent", id: OPS_AGENT_ID },
        agentId: OPS_AGENT_ID,
        ownerId: OPS_OWNER_ID,
        authError: null
      }
    );

    expect(result.status).toBe(401);
    expect(result.body?.error?.code).toBe("UNAUTHORIZED");
    expect(getPspConfigMock).not.toHaveBeenCalled();
  });

  it.each(["evidence", "evidence:confirm"])(
    "denies unrelated ops-owned agents from %s without invoking evidence services",
    async (action) => {
      const body =
        action === "evidence:confirm"
          ? {
              bucket: "evidence",
              key: `disputes/${DISPUTE_ID}/key`,
              sha256: "a".repeat(64),
              content_type: "image/png",
              bytes: 1
            }
          : {};
      const result: any = await handler(request(action, "POST", body), null, {
        actor: { type: "agent", id: OPS_AGENT_ID },
        agentId: OPS_AGENT_ID,
        ownerId: OPS_OWNER_ID,
        authError: null
      });

      expect(result.status).toBe(404);
      expect(initEvidenceUploadMock).not.toHaveBeenCalled();
      expect(confirmEvidenceUploadMock).not.toHaveBeenCalled();
    }
  );

  it("preserves participant upload initialization and binds the claim to the agent", async () => {
    const result: any = await handler(request("evidence", "POST"), null, {
      actor: { type: "agent", id: BUYER_AGENT_ID },
      agentId: BUYER_AGENT_ID,
      ownerId: OPS_OWNER_ID,
      authError: null
    });

    expect(result.status).toBe(200);
    expect(initEvidenceUploadMock).toHaveBeenCalledWith({
      disputeId: DISPUTE_ID,
      submittedBy: "BUYER",
      actor: { type: "agent", id: BUYER_AGENT_ID }
    });
  });

  it("preserves participant confirmation and passes the same actor binding", async () => {
    const body = {
      bucket: "evidence",
      key: `disputes/${DISPUTE_ID}/key`,
      sha256: "a".repeat(64),
      content_type: "image/png",
      bytes: 1
    };
    const result: any = await handler(request("evidence:confirm", "POST", body), null, {
      actor: { type: "agent", id: BUYER_AGENT_ID },
      agentId: BUYER_AGENT_ID,
      ownerId: BUYER_OWNER_ID,
      authError: null
    });

    expect(result.status).toBe(200);
    expect(confirmEvidenceUploadMock).toHaveBeenCalledWith({
      disputeId: DISPUTE_ID,
      submittedBy: "BUYER",
      bucket: "evidence",
      key: body.key,
      sha256: body.sha256,
      contentType: "image/png",
      bytes: 1,
      actor: { type: "agent", id: BUYER_AGENT_ID }
    });
  });

  it("preserves OPS evidence access for an authenticated ops owner", async () => {
    const result: any = await handler(request("evidence", "GET"), null, {
      actor: { type: "owner", id: OPS_OWNER_ID },
      ownerId: OPS_OWNER_ID,
      agentId: null,
      authError: null
    });

    expect(result.status).toBe(200);
    expect(listEvidenceBundleMock).toHaveBeenCalledWith({ disputeId: DISPUTE_ID, escrowId: ESCROW_ID });
  });

  it("preserves an ordinary owner's access on behalf of an owned participant", async () => {
    getAgentByIdMock.mockImplementation(async (agentId: string) =>
      agentId === BUYER_AGENT_ID ? ({ id: agentId, owner_id: BUYER_OWNER_ID } as any) : null
    );

    const result: any = await handler(request("evidence", "GET"), null, {
      actor: { type: "owner", id: BUYER_OWNER_ID },
      ownerId: BUYER_OWNER_ID,
      agentId: null,
      authError: null
    });

    expect(result.status).toBe(200);
    expect(listEvidenceBundleMock).toHaveBeenCalledTimes(1);
  });
});
