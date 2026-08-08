import { del, get, head, issueSignedToken, presignUrl } from "@vercel/blob";

import { getEvidenceStorageBackend } from "../config/backends";
import { getEnv } from "../config/env";
import { getSupabaseServiceClient } from "../db/supabase";

export const SUPABASE_EVIDENCE_BUCKET = "evidence";
export const VERCEL_BLOB_EVIDENCE_BUCKET = "vercel-blob-private";

type EvidenceStoragePolicy = {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
};

function buildStorageError(message: string, code = "STORAGE_ERROR", status = 500) {
  return Object.assign(new Error(message), { status, code });
}

function getEvidenceBlobToken() {
  return (
    getEnv("EVIDENCE_BLOB_READ_WRITE_TOKEN") ||
    getEnv("BLOB_READ_WRITE_TOKEN", { required: true })
  );
}

export function getEvidenceWriteBucket() {
  return getEvidenceStorageBackend() === "vercel-blob"
    ? VERCEL_BLOB_EVIDENCE_BUCKET
    : SUPABASE_EVIDENCE_BUCKET;
}

export function isSupportedEvidenceBucket(bucket: string) {
  return bucket === SUPABASE_EVIDENCE_BUCKET || bucket === VERCEL_BLOB_EVIDENCE_BUCKET;
}

function normalizeAllowedMimeTypes(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim().toLowerCase()).sort();
}

export async function assertEvidenceStoragePolicy(
  bucket: string,
  policy: EvidenceStoragePolicy
) {
  if (bucket === VERCEL_BLOB_EVIDENCE_BUCKET) {
    getEvidenceBlobToken();
    return;
  }
  if (bucket !== SUPABASE_EVIDENCE_BUCKET) {
    throw buildStorageError("Unsupported evidence storage provider");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage.getBucket(SUPABASE_EVIDENCE_BUCKET);
  if (error || !data) {
    throw buildStorageError(error?.message || "Evidence bucket not found");
  }

  const configuredTypes = normalizeAllowedMimeTypes((data as any).allowed_mime_types);
  const expectedTypes = [...policy.allowedContentTypes].sort();
  const fileSizeLimit = Number((data as any).file_size_limit);
  const hasExpectedTypes =
    configuredTypes.length === expectedTypes.length &&
    configuredTypes.every((value, index) => value === expectedTypes[index]);

  if ((data as any).public === true || fileSizeLimit !== policy.maximumSizeInBytes || !hasExpectedTypes) {
    throw buildStorageError(
      "Evidence bucket security policy is not configured",
      "EVIDENCE_BUCKET_POLICY_INVALID",
      503
    );
  }
}

export async function createEvidenceUploadUrl({
  bucket,
  key,
  expiresInSeconds,
  policy
}: {
  bucket: string;
  key: string;
  expiresInSeconds: number;
  policy: EvidenceStoragePolicy;
}) {
  if (bucket === VERCEL_BLOB_EVIDENCE_BUCKET) {
    const validUntil = Date.now() + expiresInSeconds * 1000;
    const token = getEvidenceBlobToken();
    const signedToken = await issueSignedToken({
      pathname: key,
      operations: ["put"],
      validUntil,
      allowedContentTypes: policy.allowedContentTypes,
      maximumSizeInBytes: policy.maximumSizeInBytes,
      token
    });
    const result = await presignUrl(signedToken, {
      operation: "put",
      pathname: key,
      validUntil,
      access: "private",
      allowedContentTypes: policy.allowedContentTypes,
      maximumSizeInBytes: policy.maximumSizeInBytes,
      allowOverwrite: false,
      addRandomSuffix: false,
      cacheControlMaxAge: 60
    });
    return result.presignedUrl;
  }

  if (bucket !== SUPABASE_EVIDENCE_BUCKET) {
    throw buildStorageError("Unsupported evidence storage provider");
  }
  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage
    .from(SUPABASE_EVIDENCE_BUCKET)
    .createSignedUploadUrl(key, { upsert: false });
  if (error) throw buildStorageError(error.message || "Storage error");
  const signedUrl = (data as any)?.signedUrl;
  if (!signedUrl) throw buildStorageError("Failed to create signed upload URL");
  return signedUrl;
}

export async function deleteEvidenceObject(bucket: string, key: string) {
  if (bucket === VERCEL_BLOB_EVIDENCE_BUCKET) {
    await del(key, { token: getEvidenceBlobToken() });
    return;
  }
  if (bucket !== SUPABASE_EVIDENCE_BUCKET) {
    throw buildStorageError("Unsupported evidence storage provider");
  }
  const client = getSupabaseServiceClient();
  const { error } = await client.storage.from(bucket).remove([key]);
  if (error) throw buildStorageError(error.message || "Storage error");
}

export async function getEvidenceObjectInfo(bucket: string, key: string) {
  if (bucket === VERCEL_BLOB_EVIDENCE_BUCKET) {
    try {
      const info = await head(key, { token: getEvidenceBlobToken() });
      return { size: info.size, contentType: info.contentType };
    } catch (error: any) {
      throw buildStorageError(error?.message || "Evidence file not found", "EVIDENCE_NOT_FOUND", 404);
    }
  }
  if (bucket !== SUPABASE_EVIDENCE_BUCKET) {
    throw buildStorageError("Unsupported evidence storage provider");
  }
  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage.from(bucket).info(key);
  if (error || !data) {
    throw buildStorageError(error?.message || "Evidence file not found", "EVIDENCE_NOT_FOUND", 404);
  }
  return data as any;
}

export async function downloadEvidenceObjectBytes(bucket: string, key: string) {
  if (bucket === VERCEL_BLOB_EVIDENCE_BUCKET) {
    const result = await get(key, {
      access: "private",
      useCache: false,
      token: getEvidenceBlobToken()
    });
    if (!result || result.statusCode !== 200) {
      throw buildStorageError("Evidence file not found", "EVIDENCE_NOT_FOUND", 404);
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  if (bucket !== SUPABASE_EVIDENCE_BUCKET) {
    throw buildStorageError("Unsupported evidence storage provider");
  }
  const client = getSupabaseServiceClient();
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error) throw buildStorageError(error.message || "Storage error");
  if (!data) throw buildStorageError("Evidence file not found", "EVIDENCE_NOT_FOUND", 404);
  return Buffer.from(await (data as any).arrayBuffer());
}
