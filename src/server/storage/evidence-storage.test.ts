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
  createEvidenceReadUrl,
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

  it("issues a pathname-bound private GET URL with a 60-second expiry", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    issueSignedToken.mockResolvedValue({
      delegationToken: "delegation",
      clientSigningToken: "signing",
      validUntil: 1_060_000
    });
    presignUrl.mockResolvedValue({ presignedUrl: "https://blob.test/private-read" });

    const url = await createEvidenceReadUrl(
      VERCEL_BLOB_EVIDENCE_BUCKET,
      "disputes/dispute-1/object-1"
    );
    const issuedToken = issueSignedToken.mock.calls[0][0];

    expect(url).toBe("https://blob.test/private-read");
    expect(issuedToken).toEqual({
      pathname: "disputes/dispute-1/object-1",
      operations: ["get"],
      validUntil: 1_060_000,
      token: "private-blob-token"
    });
    expect(presignUrl).toHaveBeenCalledWith(
      expect.objectContaining({ delegationToken: "delegation", clientSigningToken: "signing" }),
      {
        operation: "get",
        pathname: "disputes/dispute-1/object-1",
        validUntil: 1_060_000,
        useCache: false
      }
    );
    now.mockRestore();
  });

  it("issues a download-only Supabase URL scoped to one object for 60 seconds", async () => {
    process.env.CLAWDEALS_EVIDENCE_STORAGE_BACKEND = "supabase";
    const storage = {
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://storage.test/private-read" },
        error: null
      }))
    };
    const client = { storage: { from: vi.fn(() => storage) } };
    getSupabaseServiceClient.mockReturnValue(client);
    const key = "disputes/dispute-1/object-1";

    await expect(createEvidenceReadUrl("evidence", key)).resolves.toBe(
      "https://storage.test/private-read"
    );

    expect(client.storage.from).toHaveBeenCalledWith("evidence");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(key, 60, { download: true });
    expect(issueSignedToken).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects unknown evidence storage buckets", async () => {
    await expect(createEvidenceReadUrl("unknown", "disputes/dispute-1/object-1")).rejects.toMatchObject({
      code: "STORAGE_ERROR"
    });
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    expect(issueSignedToken).not.toHaveBeenCalled();
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
