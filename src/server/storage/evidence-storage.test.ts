import { beforeEach, describe, expect, it, vi } from "vitest";

const { del, get, head, issueSignedToken, presignUrl, getSupabaseServiceClient } = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("@vercel/blob", () => ({ del, get, head, issueSignedToken, presignUrl }));
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient }));

import {
  VERCEL_BLOB_EVIDENCE_BUCKET,
  assertEvidenceStoragePolicy,
  createEvidenceUploadUrl,
  downloadEvidenceObjectBytes,
  getEvidenceWriteBucket
} from "./evidence-storage";

const POLICY = {
  allowedContentTypes: ["image/png", "application/pdf"],
  maximumSizeInBytes: 50 * 1024 * 1024
};

beforeEach(() => {
  process.env.CLAWDEALS_EVIDENCE_STORAGE_BACKEND = "vercel-blob";
  process.env.EVIDENCE_BLOB_READ_WRITE_TOKEN = "private-blob-token";
  delete process.env.CLAWDEALS_OBJECT_STORAGE_BACKEND;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.clearAllMocks();
});

describe("private evidence storage on Vercel Blob", () => {
  it("switches evidence independently from listing media", async () => {
    expect(getEvidenceWriteBucket()).toBe(VERCEL_BLOB_EVIDENCE_BUCKET);
    await expect(assertEvidenceStoragePolicy(VERCEL_BLOB_EVIDENCE_BUCKET, POLICY)).resolves.toBeUndefined();
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("issues a pathname-bound private PUT URL with MIME, size and expiry constraints", async () => {
    issueSignedToken.mockResolvedValue({
      delegationToken: "delegation",
      clientSigningToken: "signing",
      validUntil: Date.now() + 60_000
    });
    presignUrl.mockResolvedValue({ presignedUrl: "https://blob.test/private-put" });

    const url = await createEvidenceUploadUrl({
      bucket: VERCEL_BLOB_EVIDENCE_BUCKET,
      key: "disputes/dispute-1/object-1",
      expiresInSeconds: 7200,
      policy: POLICY
    });

    expect(url).toBe("https://blob.test/private-put");
    expect(issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "disputes/dispute-1/object-1",
      operations: ["put"],
      allowedContentTypes: POLICY.allowedContentTypes,
      maximumSizeInBytes: POLICY.maximumSizeInBytes,
      token: "private-blob-token"
    }));
    expect(presignUrl).toHaveBeenCalledWith(
      expect.objectContaining({ delegationToken: "delegation", clientSigningToken: "signing" }),
      expect.objectContaining({
        operation: "put",
        pathname: "disputes/dispute-1/object-1",
        access: "private",
        allowOverwrite: false,
        addRandomSuffix: false
      })
    );
  });

  it("bypasses cache when materializing bytes for SHA-256 verification", async () => {
    const bytes = Buffer.from("evidence-bytes");
    get.mockResolvedValue({
      statusCode: 200,
      stream: new Response(bytes).body,
      headers: new Headers(),
      blob: {}
    });

    await expect(
      downloadEvidenceObjectBytes(VERCEL_BLOB_EVIDENCE_BUCKET, "disputes/dispute-1/object-1")
    ).resolves.toEqual(bytes);
    expect(get).toHaveBeenCalledWith("disputes/dispute-1/object-1", {
      access: "private",
      useCache: false,
      token: "private-blob-token"
    });
  });
});
