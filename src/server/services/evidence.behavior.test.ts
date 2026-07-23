import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import {
  confirmEvidenceUpload,
  initEvidenceUpload,
  listEvidenceBundle
} from "./evidence";

const DISPUTE_ID = "11111111-1111-4111-8111-111111111111";
const ESCROW_ID = "22222222-2222-4222-8222-222222222222";
const PACK_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MAX_BYTES = 50 * 1024 * 1024;

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
    upsert: vi.fn(() => query)
  };
  query.then = (resolve: (value: any) => void, reject: (reason: any) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function createUploadHarness(signedUploadResult: any) {
  const packQuery = createQuery({
    data: { evidence_pack_id: PACK_ID, dispute_id: DISPUTE_ID },
    error: null
  });
  const calls: Array<{ name: string; args: any }> = [];
  const rpc = vi.fn((name: string, args: any) => {
    calls.push({ name, args });
    if (name === "claim_expired_evidence_uploads_v1") {
      return Promise.resolve({ data: [], error: null });
    }
    if (name === "reserve_evidence_upload_v1") {
      return {
        single: vi.fn(async () => ({
          data: { reservation_id: "reservation-1" },
          error: null
        }))
      };
    }
    if (name === "reject_evidence_upload_v1") {
      return Promise.resolve({ data: true, error: null });
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const storageBucket = {
    createSignedUploadUrl: vi.fn(async () => signedUploadResult),
    remove: vi.fn()
  };
  const client = {
    from: vi.fn(() => packQuery),
    rpc,
    storage: {
      getBucket: vi.fn(async () => ({
        data: {
          public: false,
          file_size_limit: MAX_BYTES,
          allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"]
        },
        error: null
      })),
      from: vi.fn(() => storageBucket)
    }
  };
  return { calls, client, storageBucket };
}

describe("evidence service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      "a storage error",
      { data: null, error: { message: "storage unavailable" } },
      "storage unavailable"
    ],
    [
      "a response without a signed URL",
      { data: {}, error: null },
      "Failed to create signed upload URL"
    ]
  ])("releases the quota reservation after %s", async (_label, signedResult, message) => {
    const harness = createUploadHarness(signedResult);
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client);

    await expect(
      initEvidenceUpload({
        disputeId: DISPUTE_ID,
        submittedBy: "BUYER",
        actor: { type: "agent", id: ACTOR_ID }
      })
    ).rejects.toMatchObject({
      status: 500,
      code: "STORAGE_ERROR",
      message
    });

    expect(harness.calls).toContainEqual({
      name: "reject_evidence_upload_v1",
      args: { p_reservation_id: "reservation-1" }
    });
  });

  it.each([
    ["wrong bucket", { bucket: "public" }],
    ["empty key", { key: "" }],
    ["cross-dispute key", { key: "disputes/other/file" }],
    ["malformed hash", { sha256: "bad" }],
    ["disallowed content type", { contentType: "text/html" }],
    ["non-positive byte count", { bytes: 0 }]
  ])("rejects %s before reserving confirmation quota", async (_label, override) => {
    const client = { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      confirmEvidenceUpload({
        disputeId: DISPUTE_ID,
        submittedBy: "BUYER",
        bucket: "evidence",
        key: `disputes/${DISPUTE_ID}/file`,
        sha256: "a".repeat(64),
        contentType: "image/png",
        bytes: 4,
        actor: { type: "agent", id: ACTOR_ID },
        ...override
      })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("returns a redacted, newest-first evidence bundle across dispute and escrow audits", async () => {
    const packQuery = createQuery({
      data: { evidence_pack_id: PACK_ID, dispute_id: DISPUTE_ID },
      error: null
    });
    const itemsQuery = createQuery({
      data: [
        {
          evidence_item_id: "item-1",
          submitted_by: "BUYER",
          storage_bucket: "evidence",
          storage_key: `disputes/${DISPUTE_ID}/file`,
          content_type: "image/png",
          bytes: 4,
          sha256: "a".repeat(64),
          created_at: "2026-07-23T10:00:00.000Z",
          internal_column: "must-not-leak"
        }
      ],
      error: null
    });
    const linksQuery = createQuery({
      data: [
        {
          evidence_link_id: "link-1",
          link_type: "message",
          link_id: "message-1",
          created_at: "2026-07-23T10:01:00.000Z",
          internal_column: "must-not-leak"
        }
      ],
      error: null
    });
    const disputeAuditQuery = createQuery({
      data: [
        {
          id: "audit-dispute",
          occurred_at: "2026-07-23T11:00:00.000Z",
          actor: { type: "agent", id: ACTOR_ID },
          action: { event: "evidence.confirm", entity_type: "dispute", entity_id: DISPUTE_ID },
          outcome: "SUCCESS",
          request_id: "request-1",
          payload_fingerprint: "hash-1",
          redacted: true
        }
      ],
      error: null
    });
    const escrowAuditQuery = createQuery({
      data: [
        {
          id: "audit-escrow",
          occurred_at: "2026-07-23T12:00:00.000Z",
          actor: null,
          action: { path: "/webhooks/psp", entity_type: "escrow", entity_id: ESCROW_ID },
          outcome: "SUCCESS",
          request_id: "request-2",
          payload_fingerprint: "hash-2",
          redacted: true
        }
      ],
      error: null
    });
    let auditCall = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "evidence_packs") return packQuery;
        if (table === "evidence_items") return itemsQuery;
        if (table === "evidence_links") return linksQuery;
        if (table === "audit_logs") {
          auditCall += 1;
          return auditCall === 1 ? disputeAuditQuery : escrowAuditQuery;
        }
        throw new Error(`Unexpected table ${table}`);
      })
    };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = await listEvidenceBundle({
      disputeId: DISPUTE_ID,
      escrowId: ESCROW_ID
    });

    expect(result.items).toEqual([
      {
        evidence_item_id: "item-1",
        submitted_by: "BUYER",
        storage_bucket: "evidence",
        storage_key: `disputes/${DISPUTE_ID}/file`,
        content_type: "image/png",
        bytes: 4,
        sha256: "a".repeat(64),
        created_at: "2026-07-23T10:00:00.000Z"
      }
    ]);
    expect(result.links).toEqual([
      {
        evidence_link_id: "link-1",
        link_type: "message",
        link_id: "message-1",
        created_at: "2026-07-23T10:01:00.000Z"
      }
    ]);
    expect(result.timeline.map((entry) => entry.audit_id)).toEqual([
      "audit-escrow",
      "audit-dispute"
    ]);
    expect(result.timeline[0]).toMatchObject({
      actor: { type: "unknown", id: null },
      action: "/webhooks/psp",
      entity: { type: "escrow", id: ESCROW_ID },
      metadata: { hash: "hash-2", redacted: true }
    });
  });
});
