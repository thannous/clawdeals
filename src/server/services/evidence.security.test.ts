import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import { confirmEvidenceUpload, initEvidenceUpload } from "./evidence";

const DISPUTE_ID = "00000000-0000-4000-8000-000000000001";
const PACK_ID = "00000000-0000-4000-8000-000000000002";
const AGENT_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_AGENT_ID = "00000000-0000-4000-8000-000000000004";
const KEY = `disputes/${DISPUTE_ID}/00000000-0000-4000-8000-000000000005`;
const MAX_BYTES = 50 * 1024 * 1024;

function createHarness() {
  const calls: Array<{ name: string; args: any }> = [];
  const packQuery: any = {
    upsert: vi.fn(() => packQuery),
    select: vi.fn(() => packQuery),
    single: vi.fn(async () => ({ data: { evidence_pack_id: PACK_ID, dispute_id: DISPUTE_ID }, error: null }))
  };

  const storage = {
    getBucket: vi.fn(async () => ({
      data: {
        id: "evidence",
        public: false,
        file_size_limit: MAX_BYTES,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"]
      },
      error: null
    })),
    createSignedUploadUrl: vi.fn(async () => ({
      data: { signedUrl: "https://storage.test/upload" },
      error: null
    })),
    info: vi.fn(async () => ({ data: { size: 4, contentType: "image/png" }, error: null })),
    download: vi.fn(async () => ({ data: new Blob([Buffer.from("test")]), error: null })),
    remove: vi.fn(async () => ({ data: [], error: null }))
  };

  const reservation = {
    reservation_id: "00000000-0000-4000-8000-000000000006",
    evidence_pack_id: PACK_ID,
    storage_bucket: "evidence",
    storage_key: KEY,
    submitted_by: "BUYER",
    issued_to_type: "agent",
    issued_to_id: AGENT_ID,
    reserved_bytes: MAX_BYTES,
    status: "PENDING"
  };

  const rpc = vi.fn((name: string, args: any) => {
    calls.push({ name, args });
    if (name === "claim_expired_evidence_uploads_v1") {
      return Promise.resolve({ data: [], error: null });
    }
    if (name === "reject_evidence_upload_v1" || name === "finish_evidence_upload_cleanup_v1") {
      return Promise.resolve({ data: true, error: null });
    }
    if (name === "reserve_evidence_upload_v1" || name === "begin_evidence_upload_confirmation_v1") {
      return {
        single: vi.fn(async () => ({ data: reservation, error: null }))
      };
    }
    if (name === "finalize_evidence_upload_v1") {
      return {
        single: vi.fn(async () => ({
          data: { evidence_item_id: "00000000-0000-4000-8000-000000000007" },
          error: null
        }))
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "evidence_packs") throw new Error(`Unexpected table ${table}`);
      return packQuery;
    }),
    rpc,
    storage: {
      getBucket: storage.getBucket,
      from: vi.fn(() => storage)
    }
  };

  return { client, calls, reservation, rpc, storage };
}

describe("evidence reservation security boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds every signed upload to the authenticated agent and its evidence role", async () => {
    const harness = createHarness();
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client as any);

    const result = await initEvidenceUpload({
      disputeId: DISPUTE_ID,
      submittedBy: "BUYER",
      actor: { type: "agent", id: AGENT_ID }
    });

    const reserve = harness.calls.find((call) => call.name === "reserve_evidence_upload_v1");
    expect(reserve?.args).toMatchObject({
      p_evidence_pack_id: PACK_ID,
      p_storage_bucket: "evidence",
      p_submitted_by: "BUYER",
      p_issued_to_type: "agent",
      p_issued_to_id: AGENT_ID
    });
    expect(reserve?.args.p_storage_key).toMatch(new RegExp(`^disputes/${DISPUTE_ID}/`));
    expect(result.upload.expires_in_seconds).toBe(7200);
    expect(harness.storage.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("fails closed before issuing a URL when the bucket lacks the hard size policy", async () => {
    const harness = createHarness();
    harness.storage.getBucket.mockResolvedValueOnce({
      data: {
        id: "evidence",
        public: false,
        file_size_limit: null,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"]
      },
      error: null
    } as any);
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client as any);

    await expect(
      initEvidenceUpload({
        disputeId: DISPUTE_ID,
        submittedBy: "BUYER",
        actor: { type: "agent", id: AGENT_ID }
      })
    ).rejects.toMatchObject({ code: "EVIDENCE_BUCKET_POLICY_INVALID", status: 503 });
    expect(harness.calls.some((call) => call.name === "reserve_evidence_upload_v1")).toBe(false);
    expect(harness.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a cross-actor storage-key replay before reading object metadata", async () => {
    const harness = createHarness();
    harness.rpc.mockImplementation((name: string, args: any) => {
      harness.calls.push({ name, args });
      if (name === "claim_expired_evidence_uploads_v1") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "begin_evidence_upload_confirmation_v1") {
        return {
          single: vi.fn(async () => ({
            data: null,
            error: { code: "P0001", message: "EVIDENCE_UPLOAD_NOT_ISSUED_TO_ACTOR" }
          }))
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client as any);

    await expect(
      confirmEvidenceUpload({
        disputeId: DISPUTE_ID,
        submittedBy: "BUYER",
        actor: { type: "agent", id: OTHER_AGENT_ID },
        bucket: "evidence",
        key: KEY,
        sha256: "a".repeat(64),
        contentType: "image/png",
        bytes: 4
      })
    ).rejects.toMatchObject({ code: "EVIDENCE_UPLOAD_NOT_ISSUED_TO_ACTOR", status: 403 });
    expect(harness.storage.info).not.toHaveBeenCalled();
    expect(harness.storage.download).not.toHaveBeenCalled();
  });

  it("checks trusted object size before download and removes an oversized rejected object", async () => {
    const harness = createHarness();
    harness.storage.info.mockResolvedValueOnce({
      data: { size: MAX_BYTES + 1, contentType: "image/png" },
      error: null
    } as any);
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client as any);

    await expect(
      confirmEvidenceUpload({
        disputeId: DISPUTE_ID,
        submittedBy: "BUYER",
        actor: { type: "agent", id: AGENT_ID },
        bucket: "evidence",
        key: KEY,
        sha256: "a".repeat(64),
        contentType: "image/png",
        bytes: 1
      })
    ).rejects.toMatchObject({ code: "EVIDENCE_LIMIT_EXCEEDED", status: 400 });
    expect(harness.storage.download).not.toHaveBeenCalled();
    expect(harness.storage.remove).toHaveBeenCalledWith([KEY]);
    expect(harness.calls.some((call) => call.name === "reject_evidence_upload_v1")).toBe(true);
  });

  it("keeps a legitimate actor-bound upload working through atomic finalization", async () => {
    const harness = createHarness();
    const bytes = Buffer.from("test");
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client as any);

    const result = await confirmEvidenceUpload({
      disputeId: DISPUTE_ID,
      submittedBy: "BUYER",
      actor: { type: "agent", id: AGENT_ID },
      bucket: "evidence",
      key: KEY,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      contentType: "image/png",
      bytes: bytes.byteLength
    });

    expect(harness.storage.info.mock.invocationCallOrder[0]).toBeLessThan(
      harness.storage.download.mock.invocationCallOrder[0]
    );
    expect(harness.storage.download).toHaveBeenCalledTimes(1);
    const finalize = harness.calls.find((call) => call.name === "finalize_evidence_upload_v1");
    expect(finalize?.args).toMatchObject({
      p_reservation_id: harness.reservation.reservation_id,
      p_issued_to_type: "agent",
      p_issued_to_id: AGENT_ID,
      p_content_type: "image/png",
      p_bytes: 4
    });
    expect(result.item.evidence_item_id).toBe("00000000-0000-4000-8000-000000000007");
    expect(harness.storage.remove).not.toHaveBeenCalled();
  });

  it("deletes expired objects before releasing their reserved quota", async () => {
    const harness = createHarness();
    harness.rpc.mockImplementation((name: string, args: any) => {
      harness.calls.push({ name, args });
      if (name === "claim_expired_evidence_uploads_v1") {
        return Promise.resolve({
          data: [
            {
              reservation_id: harness.reservation.reservation_id,
              storage_bucket: "evidence",
              storage_key: KEY
            }
          ],
          error: null
        });
      }
      if (name === "finish_evidence_upload_cleanup_v1") {
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "reserve_evidence_upload_v1") {
        return { single: vi.fn(async () => ({ data: harness.reservation, error: null })) };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client as any);

    await initEvidenceUpload({
      disputeId: DISPUTE_ID,
      submittedBy: "BUYER",
      actor: { type: "agent", id: AGENT_ID }
    });

    expect(harness.storage.remove).toHaveBeenCalledWith([KEY]);
    const finishIndex = harness.calls.findIndex((call) => call.name === "finish_evidence_upload_cleanup_v1");
    const reserveIndex = harness.calls.findIndex((call) => call.name === "reserve_evidence_upload_v1");
    expect(finishIndex).toBeGreaterThanOrEqual(0);
    expect(reserveIndex).toBeGreaterThan(finishIndex);
  });
});
