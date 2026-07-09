import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn(),
  upsertOwner: vi.fn(),
  updateOwnerProfile: vi.fn(),
  invalidateOwnerChallenges: vi.fn()
}));

vi.mock("../../../../server/utils/owner-verification", () => ({
  isE164: vi.fn((v) => /^\+\d{7,15}$/.test(v)),
  normalizeEmail: vi.fn((v) => (v ? String(v).trim().toLowerCase() : null)),
  normalizePhoneE164: vi.fn((v) => v || null)
}));

import { handler } from "../../../../pages/api/v1/owner/index";
import { getOwner, upsertOwner, invalidateOwnerChallenges } from "../../../../server/services/owners";

const validUuid = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

const getOwnerMock = vi.mocked(getOwner);
const upsertOwnerMock = vi.mocked(upsertOwner);

function makeCtx(overrides: any = {}) {
  return {
    authError: null,
    ownerId: validUuid,
    actor: { type: "owner", id: validUuid },
    ...overrides
  } as any;
}

describe("GET /v1/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects legacy x-owner-id without authenticated owner context", async () => {
    const req = { method: "GET", headers: { "x-owner-id": validUuid } };
    const result: any = await handler(req, null, {});
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(getOwner).not.toHaveBeenCalled();
  });

  it("returns 400 when authenticated owner_id is not a UUID", async () => {
    const req = { method: "GET", headers: {} };
    const result: any = await handler(req, null, makeCtx({
      ownerId: "not-a-uuid",
      actor: { type: "owner", id: "not-a-uuid" }
    }));
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("UUID");
  });

  it("returns 404 when owner not found", async () => {
    getOwnerMock.mockResolvedValue(null);
    const req = { method: "GET", headers: {} };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 200 with owner summary", async () => {
    getOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: "2026-01-01T00:00:00Z",
      phone_verified_at: null
    } as any);
    const req = { method: "GET", headers: {} };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(validUuid);
    expect(result.body.data.email_verified_at).toBe("2026-01-01T00:00:00Z");
    expect(result.body.data.phone_verified_at).toBeNull();
  });

  it("returns 405 for unsupported methods", async () => {
    const req = { method: "DELETE", headers: { "x-owner-id": validUuid } };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(405);
  });
});

describe("PATCH /v1/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without email or phone", async () => {
    getOwnerMock.mockResolvedValue(null);
    const req = { method: "PATCH", headers: {}, body: {} };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("At least one field");
  });

  it("returns 400 when phone is not E.164", async () => {
    const req = {
      method: "PATCH",
      headers: {},
      body: { phone: "12345" }
    };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("E.164");
  });

  it("upserts with normalized email", async () => {
    getOwnerMock.mockResolvedValue(null);
    upsertOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    } as any);
    const req = {
      method: "PATCH",
      headers: {},
      body: { email: " User@Example.COM " }
    };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" })
    );
  });

  it("resets email_verified_at when email changes", async () => {
    getOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email: "old@example.com",
      phone_e164: null,
      email_verified_at: "2026-01-01T00:00:00Z",
      phone_verified_at: null
    } as any);
    upsertOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    } as any);
    const req = {
      method: "PATCH",
      headers: {},
      body: { email: "new@example.com" }
    };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: null })
    );
  });

  it("resets phone_verified_at when phone changes", async () => {
    getOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email: null,
      phone_e164: "+33600000000",
      email_verified_at: null,
      phone_verified_at: "2026-01-01T00:00:00Z"
    } as any);
    upsertOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    } as any);
    const req = {
      method: "PATCH",
      headers: {},
      body: { phone: "+33611111111" }
    };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({ phoneVerifiedAt: null })
    );
  });

  it("calls invalidateOwnerChallenges when email changes", async () => {
    getOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email: "old@example.com",
      phone_e164: null,
      email_verified_at: null,
      phone_verified_at: null
    } as any);
    upsertOwnerMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    } as any);
    const req = {
      method: "PATCH",
      headers: {},
      body: { email: "new@example.com" }
    };
    await handler(req, null, makeCtx());
    expect(invalidateOwnerChallenges).toHaveBeenCalledWith({ ownerId: validUuid, type: "EMAIL" });
  });
});
