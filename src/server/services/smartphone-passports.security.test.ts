import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { emptySmartphonePassportInput, parseSmartphonePassportInput } from "../../lib/smartphone-passport";
import { getSmartphonePassport, getSmartphonePassportPhoto, normalizePassportPhoto, saveSmartphonePassport } from "./smartphone-passports";

const mocks = vi.hoisted(() => ({ client: vi.fn(), download: vi.fn(), policy: vi.fn() }));
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: mocks.client }));
vi.mock("../storage/evidence-storage", () => ({
  assertEvidenceStoragePolicy: mocks.policy, downloadEvidenceObjectBytes: mocks.download,
  deleteEvidenceObject: vi.fn(), getEvidenceWriteBucket: () => "evidence", putPrivateEvidenceObject: vi.fn()
}));
const LISTING = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const PHOTO = "33333333-3333-4333-8333-333333333333";

function database(responses: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => {
    const result = { data: responses[table]?.shift() ?? null, error: null };
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => result, then: (resolve: any) => Promise.resolve(result).then(resolve) };
    return query;
  });
  const client = { from, rpc: vi.fn() };
  mocks.client.mockReturnValue(client);
  return client;
}
const listing = { listing_id: LISTING, owner_id: OWNER, status: "LIVE" };

// Browser fixtures cannot prove server-side authorization, file decoding or a
// visibility change during storage I/O. These tests exercise those boundaries.
describe("smartphone passport security", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.policy.mockResolvedValue(undefined); });

  it.each(["DRAFT", "PENDING_APPROVAL", "RESERVED", "REMOVED", "EXPIRED", "COMPLETED"])("does not read a %s listing's passport", async (status) => {
    const client = database({ listings: [{ ...listing, status }] });
    await expect(getSmartphonePassport(LISTING, { kind: "public" })).rejects.toMatchObject({ status: 404 });
    expect(client.from.mock.calls.map(([table]) => table)).toEqual(["listings"]);
  });

  it("rejects an owner accessing another seller before querying passport content", async () => {
    const client = database({ listings: [listing] });
    await expect(getSmartphonePassport(LISTING, { kind: "owner", ownerId: PHOTO })).rejects.toMatchObject({ status: 404 });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("blocks changing a reserved listing before invoking a write", async () => {
    const client = database({ listings: [{ ...listing, status: "RESERVED" }] });
    await expect(saveSmartphonePassport(LISTING, OWNER, { ...emptySmartphonePassportInput(), model: "Phone" })).rejects.toMatchObject({ code: "PASSPORT_LOCKED" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("never turns an unknown answer with a photo into a documented claim", async () => {
    const input = emptySmartphonePassportInput();
    input.checks.battery.photo_ids = [PHOTO];
    database({ listings: [listing, listing], smartphone_passports: [{ ...input, listing_id: LISTING, revision: 1, updated_at: "2026-10-22T10:00:00Z" }], smartphone_passport_photos: [[{ photo_id: PHOTO, listing_id: LISTING, check_id: "battery", created_at: "2026-10-22T10:00:00Z" }]] });
    const passport = await getSmartphonePassport(LISTING, { kind: "public" });
    expect(passport?.checks[0].status).toBe("missing");
    expect(passport?.questions).toContainEqual(expect.objectContaining({ check_id: "battery", reason: "answer_missing" }));
    expect(JSON.stringify(passport)).not.toContain("storage_key");
  });

  it("canonicalizes photo UUIDs and rejects duplicates differing only by case", () => {
    const input = { ...emptySmartphonePassportInput(), model: "Phone" };
    const photoId = "abcdef12-abcd-4abc-8abc-abcdef123456";
    input.checks.battery.photo_ids = [photoId.toUpperCase()];
    expect(parseSmartphonePassportInput(input).checks.battery.photo_ids).toEqual([photoId]);
    input.checks.screen.photo_ids = [photoId];
    expect(() => parseSmartphonePassportInput(input)).toThrow("Invalid or duplicate photo_id");
    input.checks.screen.photo_ids = [];
    input.checks.battery.photo_ids.push(photoId);
    expect(() => parseSmartphonePassportInput(input)).toThrow("Invalid or duplicate photo_id");
  });

  it("preserves documented evidence when an older stored photo UUID uses uppercase", async () => {
    const input = emptySmartphonePassportInput();
    const photoId = "abcdef12-abcd-4abc-8abc-abcdef123456";
    input.checks.battery = { answer: "ok", notes: "Battery tested", photo_ids: [photoId.toUpperCase()] };
    database({ listings: [listing, listing], smartphone_passports: [{ ...input, listing_id: LISTING, revision: 1, updated_at: "2026-10-22T10:00:00Z" }], smartphone_passport_photos: [[{ photo_id: photoId, listing_id: LISTING, check_id: "battery", created_at: "2026-10-22T10:00:00Z" }]] });
    const passport = await getSmartphonePassport(LISTING, { kind: "public" });
    expect(passport?.checks[0].status).toBe("documented");
    expect(passport?.checks[0].photos.map((photo) => photo.photo_id)).toEqual([photoId]);
    expect(passport?.questions).not.toContainEqual(expect.objectContaining({ check_id: "battery", reason: "photo_missing" }));
  });

  it("does not expose an unattached photo on a LIVE listing", async () => {
    database({ listings: [listing], smartphone_passport_photos: [{ photo_id: PHOTO, owner_id: OWNER, status: "READY", attached: false }] });
    await expect(getSmartphonePassportPhoto(LISTING, PHOTO, { kind: "public" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rechecks attachment after an in-flight storage download", async () => {
    database({ listings: [listing, listing], smartphone_passport_photos: [
      { photo_id: PHOTO, owner_id: OWNER, status: "READY", attached: true, bytes: 3, storage_bucket: "evidence", storage_key: "private-key" },
      { photo_id: PHOTO, owner_id: OWNER, status: "READY", attached: false }
    ] });
    mocks.download.mockResolvedValue(Buffer.from("jpg"));
    await expect(getSmartphonePassportPhoto(LISTING, PHOTO, { kind: "public" })).rejects.toMatchObject({ status: 404 });
  });

  it("rechecks listing visibility after loading passport content", async () => {
    const input = emptySmartphonePassportInput();
    database({ listings: [listing, { ...listing, status: "REMOVED" }], smartphone_passports: [{ ...input, listing_id: LISTING, revision: 1 }], smartphone_passport_photos: [[]] });
    await expect(getSmartphonePassport(LISTING, { kind: "public" })).rejects.toMatchObject({ status: 404 });
  });

  it.each(["owner_id", "status", "verified", "url"])("rejects a caller-controlled %s field", (field) => {
    expect(() => parseSmartphonePassportInput({ ...emptySmartphonePassportInput(), model: "Phone", [field]: "injected" })).toThrow("Unknown passport field");
  });

  it("rejects forged proof levels, unbounded battery values and unexplained issues", () => {
    const input = { ...emptySmartphonePassportInput(), model: "Phone" };
    expect(() => parseSmartphonePassportInput({ ...input, battery_health_percent: 101 })).toThrow("Battery health");
    input.checks.screen.answer = "issue";
    expect(() => parseSmartphonePassportInput(input)).toThrow("Describe the screen issue");
    input.checks.screen.answer = "ok";
    expect(() => parseSmartphonePassportInput({ ...input, checks: { ...input.checks, screen: { ...input.checks.screen, status: "verified" } } })).toThrow("Unknown check field");
  });

  it("decodes real pixels and strips EXIF metadata before private storage", async () => {
    const source = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#aabbcc" } }).withExif({ IFD0: { Artist: "private artist" } }).jpeg().toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const output = await normalizePassportPhoto("image/jpeg", source.toString("base64"));
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects SVG/HTML disguised as JPEG, content-type mismatches and oversized files", async () => {
    await expect(normalizePassportPhoto("image/jpeg", Buffer.from("<svg><script>bad()</script></svg>").toString("base64"))).rejects.toMatchObject({ status: 400 });
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
    await expect(normalizePassportPhoto("image/jpeg", png.toString("base64"))).rejects.toMatchObject({ status: 400 });
    await expect(normalizePassportPhoto("image/png", "A".repeat(3 * 1024 * 1024))).rejects.toMatchObject({ code: "PHOTO_TOO_LARGE" });
  });

  it("bounds decoded pixel count against small compressed image bombs", async () => {
    const source = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizePassportPhoto("image/png", source.toString("base64"))).rejects.toMatchObject({ status: 400 });
  });
});
