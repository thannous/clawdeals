import crypto from "crypto";
import { getSupabaseServiceClient } from "../db/supabase";
import {
  assertEvidenceStoragePolicy,
  createEvidenceUploadUrl,
  deleteEvidenceObject,
  downloadEvidenceObjectBytes,
  getEvidenceObjectInfo,
  getEvidenceWriteBucket,
  isSupportedEvidenceBucket
} from "../storage/evidence-storage";
import { mapSupabaseError } from "./supabase-errors";

const MAX_FILES_PER_DISPUTE = 10;
const MAX_TOTAL_BYTES_PER_DISPUTE = 50 * 1024 * 1024;
const SIGNED_UPLOAD_EXPIRES_SECONDS = 2 * 60 * 60;
const RESERVATION_EXPIRY_GRACE_SECONDS = 5 * 60;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

function mapError(error: any): never {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function throwEvidenceRpcError(error: any): never {
  const message = String(error?.message || "");
  if (message.includes("EVIDENCE_LIMIT_EXCEEDED")) {
    throw buildServiceError("Evidence limit exceeded", 400, "EVIDENCE_LIMIT_EXCEEDED", {
      max_files: MAX_FILES_PER_DISPUTE,
      max_total_bytes: MAX_TOTAL_BYTES_PER_DISPUTE
    });
  }
  if (message.includes("EVIDENCE_UPLOAD_NOT_ISSUED_TO_ACTOR")) {
    throw buildServiceError(
      "Evidence upload was not issued to this actor",
      403,
      "EVIDENCE_UPLOAD_NOT_ISSUED_TO_ACTOR"
    );
  }
  if (message.includes("EVIDENCE_ALREADY_CONFIRMED") || error?.code === "23505") {
    throw buildServiceError("Evidence upload already confirmed", 409, "EVIDENCE_ALREADY_CONFIRMED");
  }
  if (message.includes("EVIDENCE_UPLOAD_EXPIRED")) {
    throw buildServiceError("Evidence upload expired", 409, "EVIDENCE_UPLOAD_EXPIRED");
  }
  if (message.includes("EVIDENCE_CONFIRMATION_INVALID")) {
    throw buildServiceError("Evidence confirmation is invalid", 409, "EVIDENCE_CONFIRMATION_INVALID");
  }
  if (
    message.includes("EVIDENCE_UPLOAD_KEY_INVALID") ||
    message.includes("EVIDENCE_UPLOAD_ACTOR_INVALID") ||
    message.includes("EVIDENCE_UPLOAD_EXPIRY_INVALID")
  ) {
    throw buildServiceError("Evidence upload is invalid", 400, "VALIDATION_ERROR");
  }
  mapError(error);
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

type EvidenceActor = {
  type: "agent" | "owner";
  id: string;
};

const EVIDENCE_STORAGE_POLICY = {
  allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
  maximumSizeInBytes: MAX_TOTAL_BYTES_PER_DISPUTE
};

async function rejectEvidenceReservation(reservationId: string) {
  const client = getSupabaseServiceClient();
  const { error } = await client.rpc("reject_evidence_upload_v1", {
    p_reservation_id: reservationId
  });
  if (error) {
    mapError(error);
  }
}

async function cleanupExpiredEvidenceUploads(evidencePackId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("claim_expired_evidence_uploads_v1", {
    p_evidence_pack_id: evidencePackId,
    p_limit: MAX_FILES_PER_DISPUTE
  });
  if (error) {
    mapError(error);
  }

  for (const reservation of data || []) {
    const bucket = String(reservation.storage_bucket || "");
    const key = String(reservation.storage_key || "");
    const reservationId = String(reservation.reservation_id || "");
    if (!bucket || !key || !reservationId) {
      continue;
    }

    try {
      await deleteEvidenceObject(bucket, key);
    } catch {
      // CLEANING remains quota-accounted and is retried by the next init/confirm.
      continue;
    }

    const { error: finishError } = await client.rpc("finish_evidence_upload_cleanup_v1", {
      p_reservation_id: reservationId
    });
    if (finishError) {
      mapError(finishError);
    }
  }
}

export async function initEvidenceUpload({
  disputeId,
  submittedBy,
  actor
}: {
  disputeId: string;
  submittedBy: "BUYER" | "SELLER" | "OPS";
  actor: EvidenceActor;
}) {
  const pack = await ensureEvidencePack(disputeId);
  await cleanupExpiredEvidenceUploads(pack.evidence_pack_id);
  const bucket = getEvidenceWriteBucket();
  await assertEvidenceStoragePolicy(bucket, EVIDENCE_STORAGE_POLICY);

  const key = `disputes/${disputeId}/${crypto.randomUUID()}`;
  const client = getSupabaseServiceClient();
  const expiresAt = new Date(
    Date.now() + (SIGNED_UPLOAD_EXPIRES_SECONDS + RESERVATION_EXPIRY_GRACE_SECONDS) * 1000
  ).toISOString();
  const { data: reservation, error: reservationError } = await client
    .rpc("reserve_evidence_upload_v1", {
      p_evidence_pack_id: pack.evidence_pack_id,
      p_storage_bucket: bucket,
      p_storage_key: key,
      p_submitted_by: submittedBy,
      p_issued_to_type: actor.type,
      p_issued_to_id: actor.id,
      p_expires_at: expiresAt
    })
    .single();
  if (reservationError || !reservation) {
    throwEvidenceRpcError(reservationError || new Error("Evidence reservation failed"));
  }

  let signedUrl: string;
  try {
    signedUrl = await createEvidenceUploadUrl({
      bucket,
      key,
      expiresInSeconds: SIGNED_UPLOAD_EXPIRES_SECONDS,
      policy: EVIDENCE_STORAGE_POLICY
    });
  } catch (error: any) {
    await rejectEvidenceReservation(String((reservation as any).reservation_id));
    throw buildServiceError(error?.message || "Storage error", error?.status || 500, error?.code || "STORAGE_ERROR");
  }

  return {
    pack,
    upload: {
      bucket,
      key,
      url: signedUrl,
      expires_in_seconds: SIGNED_UPLOAD_EXPIRES_SECONDS
    }
  };
}

function requireKeyInDispute(disputeId: string, key: string) {
  if (!key.startsWith(`disputes/${disputeId}/`)) {
    throw buildServiceError("Invalid evidence key", 400, "VALIDATION_ERROR");
  }
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
  bytes,
  actor
}: {
  disputeId: string;
  submittedBy: "BUYER" | "SELLER" | "OPS";
  bucket: string;
  key: string;
  sha256: string;
  contentType: string;
  bytes: number;
  actor: EvidenceActor;
}) {
  if (!isSupportedEvidenceBucket(bucket)) {
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
  const client = getSupabaseServiceClient();
  await cleanupExpiredEvidenceUploads(pack.evidence_pack_id);

  const { data: reservation, error: beginError } = await client
    .rpc("begin_evidence_upload_confirmation_v1", {
      p_evidence_pack_id: pack.evidence_pack_id,
      p_storage_bucket: bucket,
      p_storage_key: key,
      p_submitted_by: submittedBy,
      p_issued_to_type: actor.type,
      p_issued_to_id: actor.id,
      p_bytes: bytes
    })
    .single();
  if (beginError || !reservation) {
    throwEvidenceRpcError(beginError || new Error("Evidence confirmation could not start"));
  }

  const reservationId = String((reservation as any).reservation_id);
  let finalizeStarted = false;
  try {
    const objectInfo = await getEvidenceObjectInfo(bucket, key);
    const actualBytes = Number(objectInfo.size);
    const reservedBytes = Number((reservation as any).reserved_bytes);
    if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0) {
      throw buildServiceError("Evidence object size is invalid", 400, "VALIDATION_ERROR");
    }
    if (actualBytes > reservedBytes) {
      throw buildServiceError("Evidence size limit exceeded", 400, "EVIDENCE_LIMIT_EXCEEDED", {
        max_total_bytes: MAX_TOTAL_BYTES_PER_DISPUTE
      });
    }
    if (actualBytes !== bytes) {
      throw buildServiceError("bytes mismatch", 400, "VALIDATION_ERROR", {
        expected: bytes,
        actual: actualBytes
      });
    }

    const storedContentType =
      typeof objectInfo.contentType === "string" ? objectInfo.contentType.trim().toLowerCase() : null;
    if (storedContentType && storedContentType !== normalizedContentType) {
      throw buildServiceError("content_type mismatch", 400, "VALIDATION_ERROR", {
        expected: normalizedContentType,
        actual: storedContentType
      });
    }

    // The trusted metadata bound is checked before the body is materialized.
    const fileBytes = await downloadEvidenceObjectBytes(bucket, key);
    if (fileBytes.byteLength !== actualBytes) {
      throw buildServiceError("bytes mismatch", 400, "VALIDATION_ERROR", {
        expected: actualBytes,
        actual: fileBytes.byteLength
      });
    }

    const computed = sha256Hex(fileBytes);
    if (computed !== normalizedSha) {
      throw buildServiceError("Evidence hash mismatch", 400, "EVIDENCE_HASH_INVALID");
    }

    finalizeStarted = true;
    const { data: item, error: finalizeError } = await client
      .rpc("finalize_evidence_upload_v1", {
        p_reservation_id: reservationId,
        p_issued_to_type: actor.type,
        p_issued_to_id: actor.id,
        p_content_type: normalizedContentType,
        p_bytes: actualBytes,
        p_sha256: normalizedSha
      })
      .single();
    if (finalizeError || !item) {
      throwEvidenceRpcError(finalizeError || new Error("Evidence confirmation failed"));
    }
    return { pack, item };
  } catch (error) {
    if (!finalizeStarted) {
      try {
        await deleteEvidenceObject(bucket, key);
      } catch {
        throw buildServiceError(
          "Evidence cleanup failed; reservation remains quota-accounted",
          500,
          "EVIDENCE_CLEANUP_FAILED"
        );
      }
      await rejectEvidenceReservation(reservationId);
    }
    throw error;
  }
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
