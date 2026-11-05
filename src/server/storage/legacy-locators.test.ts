import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ supabase: vi.fn(), put: vi.fn(), del: vi.fn(), get: vi.fn(), head: vi.fn(), issue: vi.fn(), presign: vi.fn() }));
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: transport.supabase }));
vi.mock("@vercel/blob", () => ({ put: transport.put, del: transport.del, get: transport.get, head: transport.head, issueSignedToken: transport.issue, presignUrl: transport.presign }));
import { deleteListingPhoto, uploadListingPhoto } from "../services/listing-media-storage";
import { assertEvidenceStoragePolicy, createEvidenceUploadUrl, deleteEvidenceObject, downloadEvidenceObjectBytes, getEvidenceObjectInfo, getEvidenceWriteBucket, putPrivateEvidenceObject } from "./evidence-storage";

const POLICY = { allowedContentTypes: ["image/png"], maximumSizeInBytes: 100 };
const SOURCE_URL = "https://gztfmpuqtpvncdcuhqxy.supabase.co/storage/v1/object/public/photos/fixture.jpg";

beforeEach(() => {
  vi.stubEnv("CLAWDEALS_REHEARSAL_MODE", "false");
  vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "neon");
  vi.stubEnv("CLAWDEALS_OBJECT_STORAGE_BACKEND", "vercel-blob");
  vi.stubEnv("CLAWDEALS_LISTING_STORAGE_BACKEND", "vercel-blob");
  vi.stubEnv("CLAWDEALS_EVIDENCE_STORAGE_BACKEND", "vercel-blob");
  vi.stubEnv("SUPABASE_URL", "https://gztfmpuqtpvncdcuhqxy.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fake-inherited-test-credential");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fake-blob-test-credential");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network call"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks();
});
function expectNoProvider() {
  for (const fn of Object.values(transport)) expect(fn).not.toHaveBeenCalled();
}

describe("live Neon legacy locator refusal, independent of rehearsal", () => {
  it("rejects bare/retired listing locators before opening any provider", async () => {
    for (const storageKey of ["listings/fixture/photo.jpg", SOURCE_URL, "//gztfmpuqtpvncdcuhqxy.supabase.co/fixture.jpg"]) {
      await expect(deleteListingPhoto({ storageKey })).rejects.toMatchObject({ code: "LEGACY_STORAGE_UNAVAILABLE" });
    }
    expectNoProvider();
  });
  it("does not silently route mismatched new-upload configuration to Supabase", async () => {
    vi.stubEnv("CLAWDEALS_LISTING_STORAGE_BACKEND", "supabase");
    await expect(uploadListingPhoto({ listingId: "fixture", bytes: Buffer.from("fixture"), mime: "image/jpeg" })).rejects.toMatchObject({ code: "LEGACY_STORAGE_UNAVAILABLE" });
    vi.stubEnv("CLAWDEALS_EVIDENCE_STORAGE_BACKEND", "supabase");
    expect(getEvidenceWriteBucket).toThrow(/unavailable on Neon/);
    expectNoProvider();
  });
  it("rejects legacy evidence records and retired URLs before reads, writes or signed capabilities", async () => {
    for (const [bucket, key] of [["evidence", "disputes/fixture/object"], ["vercel-blob-private", SOURCE_URL]]) {
      for (const call of [
        () => getEvidenceObjectInfo(bucket, key),
        () => downloadEvidenceObjectBytes(bucket, key),
        () => deleteEvidenceObject(bucket, key),
        () => putPrivateEvidenceObject(bucket, key, Buffer.from("fixture"), "image/png"),
        () => createEvidenceUploadUrl({ bucket, key, expiresInSeconds: 60, policy: POLICY })
      ]) await expect(call()).rejects.toMatchObject({ code: "LEGACY_STORAGE_UNAVAILABLE" });
    }
    await expect(assertEvidenceStoragePolicy("evidence", POLICY)).rejects.toMatchObject({ code: "LEGACY_STORAGE_UNAVAILABLE" });
    expectNoProvider();
  });
  it("still uses explicit Blob locators and private Blob pathname keys on Neon", async () => {
    transport.del.mockResolvedValue(undefined);
    transport.put.mockResolvedValue({});
    const storageKey = "https://store.public.blob.vercel-storage.com/listings/fixture/photo.jpg";
    await deleteListingPhoto({ storageKey });
    await putPrivateEvidenceObject("vercel-blob-private", "smartphone-passports/fixture/photo.jpg", Buffer.from("fixture"), "image/jpeg");
    expect(transport.del).toHaveBeenCalledWith(storageKey, expect.any(Object));
    expect(transport.put).toHaveBeenCalledWith("smartphone-passports/fixture/photo.jpg", expect.any(Buffer), expect.any(Object));
    expect(transport.supabase).not.toHaveBeenCalled();
  });
  it("preserves legacy Supabase listing deletion and evidence reads outside Neon", async () => {
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "supabase");
    const remove = vi.fn().mockResolvedValue({ error: null });
    const info = vi.fn().mockResolvedValue({ data: { size: 7 }, error: null });
    const from = vi.fn(() => ({ remove, info }));
    transport.supabase.mockReturnValue({ storage: { from } });
    await deleteListingPhoto({ storageKey: "listings/fixture/photo.jpg" });
    await expect(getEvidenceObjectInfo("evidence", "disputes/fixture/object")).resolves.toEqual({ size: 7 });
    expect(remove).toHaveBeenCalledWith(["listings/fixture/photo.jpg"]);
    expect(info).toHaveBeenCalledWith("disputes/fixture/object");
    expect(transport.del).not.toHaveBeenCalled();
  });
});
