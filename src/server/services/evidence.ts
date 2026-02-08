import crypto from "crypto";
import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const EVIDENCE_BUCKET = "evidence";
const MAX_FILES_PER_DISPUTE = 10;
const MAX_TOTAL_BYTES_PER_DISPUTE = 50 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details && typeof details === "object") {
    error.details = details;
  }
  return error;
}

export function isValidSha256Hex(value: any) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value.trim());
}

export function isAllowedEvidenceContentType(value: any) {
  if (typeof value !== "string") return false;
  return ALLOWED_CONTENT_TYPES.has(value.trim().toLowerCase());
}

export async function getDispute(disputeId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("disputes")
    .select("dispute_id,escrow_id,status,created_at,updated_at")
    .eq("dispute_id", disputeId)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getEscrow(escrowId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("escrows").select("*").eq("escrow_id", escrowId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function ensureEvidencePack(disputeId: string) {
  const client = getSupabaseServiceClient();
  const payload = {
    dispute_id: disputeId
  };

  const { data, error } = await client
    .from("evidence_packs")
    .upsert(payload, { onConflict: "dispute_id" })
    .select("*")
    .single();
  if (error) {
    mapError(error);
  }
  return data;
}

export async function listEvidenceItemsForPack(evidencePackId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("evidence_items")
    .select("*")
    .eq("evidence_pack_id", evidencePackId)
    .order("created_at", { ascending: false });
  if (error) {
    mapError(error);
  }
  return data || [];
}

export async function initEvidenceUpload({ disputeId }: { disputeId: string }) {
  const pack = await ensureEvidencePack(disputeId);
  const existing = await listEvidenceItemsForPack(pack.evidence_pack_id);
  if (existing.length >= MAX_FILES_PER_DISPUTE) {
    throw buildServiceError("Evidence file limit exceeded", 400, "EVIDENCE_LIMIT_EXCEEDED", {
      max_files: MAX_FILES_PER_DISPUTE
    });
  }

  const key = `disputes/${disputeId}/${crypto.randomUUID()}`;

  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(key, { upsert: false });
  if (error) {
    throw buildServiceError(error.message || "Storage error", 500, "STORAGE_ERROR");
  }
  const signedUrl = (data as any)?.signedUrl;
  if (!signedUrl) {
    throw buildServiceError("Failed to create signed upload URL", 500, "STORAGE_ERROR");
  }

  return {
    pack,
    upload: {
      bucket: EVIDENCE_BUCKET,
      key,
      url: signedUrl,
      expires_in_seconds: 900
    }
  };
}

function requireKeyInDispute(disputeId: string, key: string) {
  if (!key.startsWith(`disputes/${disputeId}/`)) {
    throw buildServiceError("Invalid evidence key", 400, "VALIDATION_ERROR");
  }
}

async function downloadObjectBytes(bucket: string, key: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error) {
    throw buildServiceError(error.message || "Storage error", 500, "STORAGE_ERROR");
  }
  if (!data) {
    throw buildServiceError("Evidence file not found", 404, "EVIDENCE_NOT_FOUND");
  }

  // supabase-js returns a Blob.
  const arrayBuffer = await (data as any).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function sha256Hex(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function confirmEvidenceUpload({
  disputeId,
  submittedBy,
  bucket,
  key,
  sha256,
  contentType,
  bytes
}: {
  disputeId: string;
  submittedBy: "BUYER" | "SELLER" | "OPS";
  bucket: string;
  key: string;
  sha256: string;
  contentType: string;
  bytes: number;
}) {
  if (bucket !== EVIDENCE_BUCKET) {
    throw buildServiceError("Invalid evidence bucket", 400, "VALIDATION_ERROR");
  }
  if (typeof key !== "string" || !key.trim()) {
    throw buildServiceError("key is required", 400, "VALIDATION_ERROR");
  }
  requireKeyInDispute(disputeId, key);

  if (!isValidSha256Hex(sha256)) {
    throw buildServiceError("Invalid sha256", 400, "VALIDATION_ERROR");
  }
  const normalizedSha = sha256.trim().toLowerCase();

  if (!isAllowedEvidenceContentType(contentType)) {
    throw buildServiceError("Invalid content_type", 400, "VALIDATION_ERROR");
  }
  const normalizedContentType = contentType.trim().toLowerCase();

  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw buildServiceError("Invalid bytes", 400, "VALIDATION_ERROR");
  }

  const pack = await ensureEvidencePack(disputeId);
  const existing = await listEvidenceItemsForPack(pack.evidence_pack_id);
  if (existing.length >= MAX_FILES_PER_DISPUTE) {
    throw buildServiceError("Evidence file limit exceeded", 400, "EVIDENCE_LIMIT_EXCEEDED", {
      max_files: MAX_FILES_PER_DISPUTE
    });
  }

  const bytesUsed = existing.reduce((sum, item: any) => sum + Number(item.bytes || 0), 0);
  if (bytesUsed + bytes > MAX_TOTAL_BYTES_PER_DISPUTE) {
    throw buildServiceError("Evidence size limit exceeded", 400, "EVIDENCE_LIMIT_EXCEEDED", {
      max_total_bytes: MAX_TOTAL_BYTES_PER_DISPUTE
    });
  }

  const fileBytes = await downloadObjectBytes(bucket, key);
  if (fileBytes.byteLength !== bytes) {
    throw buildServiceError("bytes mismatch", 400, "VALIDATION_ERROR", {
      expected: bytes,
      actual: fileBytes.byteLength
    });
  }

  const computed = sha256Hex(fileBytes);
  if (computed !== normalizedSha) {
    throw buildServiceError("Evidence hash mismatch", 400, "EVIDENCE_HASH_INVALID");
  }

  const client = getSupabaseServiceClient();
  const insertPayload = {
    evidence_pack_id: pack.evidence_pack_id,
    submitted_by: submittedBy,
    storage_bucket: bucket,
    storage_key: key,
    content_type: normalizedContentType,
    bytes,
    sha256: normalizedSha
  };

  const { data, error } = await client.from("evidence_items").insert(insertPayload).select("*").single();
  if (error) {
    mapError(error);
  }
  return { pack, item: data };
}

function mapAuditRow(row: any) {
  return {
    audit_id: row.id,
    ts: row.occurred_at,
    actor: { type: row.actor?.type || "unknown", id: row.actor?.id || null },
    action: row.action?.event || row.action?.path || "unknown",
    entity: { type: row.action?.entity_type || null, id: row.action?.entity_id || null },
    outcome: row.outcome,
    metadata: { hash: row.payload_fingerprint, redacted: row.redacted },
    request_id: row.request_id
  };
}

export async function listEvidenceBundle({
  disputeId,
  escrowId
}: {
  disputeId: string;
  escrowId: string;
}) {
  const pack = await ensureEvidencePack(disputeId);
  const [items, links] = await Promise.all([
    listEvidenceItemsForPack(pack.evidence_pack_id),
    (async () => {
      const client = getSupabaseServiceClient();
      const { data, error } = await client
        .from("evidence_links")
        .select("*")
        .eq("evidence_pack_id", pack.evidence_pack_id)
        .order("created_at", { ascending: false });
      if (error) {
        mapError(error);
      }
      return data || [];
    })()
  ]);

  const client = getSupabaseServiceClient();

  const [disputeAudit, escrowAudit] = await Promise.all([
    client
      .from("audit_logs")
      .select("id,occurred_at,actor,action,outcome,request_id,payload_fingerprint,redacted")
      .eq("action->>entity_type", "dispute")
      .eq("action->>entity_id", disputeId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
    client
      .from("audit_logs")
      .select("id,occurred_at,actor,action,outcome,request_id,payload_fingerprint,redacted")
      .eq("action->>entity_type", "escrow")
      .eq("action->>entity_id", escrowId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50)
  ]);

  if (disputeAudit.error) {
    mapError(disputeAudit.error);
  }
  if (escrowAudit.error) {
    mapError(escrowAudit.error);
  }

  const timeline = [...(disputeAudit.data || []), ...(escrowAudit.data || [])]
    .map(mapAuditRow)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, 50);

  return {
    evidence_pack_id: pack.evidence_pack_id,
    dispute_id: disputeId,
    items: items.map((row: any) => ({
      evidence_item_id: row.evidence_item_id,
      submitted_by: row.submitted_by,
      storage_bucket: row.storage_bucket,
      storage_key: row.storage_key,
      content_type: row.content_type,
      bytes: row.bytes,
      sha256: row.sha256,
      created_at: row.created_at
    })),
    links: links.map((row: any) => ({
      evidence_link_id: row.evidence_link_id,
      link_type: row.link_type,
      link_id: row.link_id,
      created_at: row.created_at
    })),
    timeline
  };
}

