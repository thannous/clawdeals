import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn(),
  upsertOwner: vi.fn(),
  invalidateOwnerChallenges: vi.fn()
}));

vi.mock("../../../../server/utils/owner-verification", () => ({
  isE164: vi.fn((v) => /^\+\d{7,15}$/.test(v)),
  normalizeEmail: vi.fn((v) => (v ? String(v).trim().toLowerCase() : null)),
  normalizePhoneE164: vi.fn((v) => v || null)
}));

import { handler } from "./index";
import { getOwner, upsertOwner, invalidateOwnerChallenges } from "../../../../server/services/owners";

const validUuid = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

describe("GET /v1/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without x-owner-id", async () => {
    const req = { method: "GET", headers: {} };
    const result = await handler(req);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toContain("x-owner-id");
  });

  it("returns 400 when x-owner-id is not a UUID", async () => {
    const req = { method: "GET", headers: { "x-owner-id": "not-a-uuid" } };
    const result = await handler(req);
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("UUID");
  });

  it("returns 404 when owner not found", async () => {
    getOwner.mockResolvedValue(null);
    const req = { method: "GET", headers: { "x-owner-id": validUuid } };
    const result = await handler(req);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 200 with owner summary", async () => {
    getOwner.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: "2026-01-01T00:00:00Z",
      phone_verified_at: null
    });
    const req = { method: "GET", headers: { "x-owner-id": validUuid } };
    const result = await handler(req);
    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(validUuid);
    expect(result.body.data.email_verified_at).toBe("2026-01-01T00:00:00Z");
    expect(result.body.data.phone_verified_at).toBeNull();
  });

  it("returns 405 for unsupported methods", async () => {
    const req = { method: "DELETE", headers: { "x-owner-id": validUuid } };
    const result = await handler(req);
    expect(result.status).toBe(405);
  });
});

describe("PATCH /v1/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without email or phone", async () => {
    getOwner.mockResolvedValue(null);
    const req = { method: "PATCH", headers: { "x-owner-id": validUuid }, body: {} };
    const result = await handler(req);
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("email or phone");
  });

  it("returns 400 when phone is not E.164", async () => {
    const req = {
      method: "PATCH",
      headers: { "x-owner-id": validUuid },
      body: { phone: "12345" }
    };
    const result = await handler(req);
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("E.164");
  });

  it("upserts with normalized email", async () => {
    getOwner.mockResolvedValue(null);
    upsertOwner.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    });
    const req = {
      method: "PATCH",
      headers: { "x-owner-id": validUuid },
      body: { email: " User@Example.COM " }
    };
    const result = await handler(req);
    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" })
    );
  });

  it("resets email_verified_at when email changes", async () => {
    getOwner.mockResolvedValue({
      owner_id: validUuid,
      email: "old@example.com",
      phone_e164: null,
      email_verified_at: "2026-01-01T00:00:00Z",
      phone_verified_at: null
    });
    upsertOwner.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    });
    const req = {
      method: "PATCH",
      headers: { "x-owner-id": validUuid },
      body: { email: "new@example.com" }
    };
    const result = await handler(req);
    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: null })
    );
  });

  it("resets phone_verified_at when phone changes", async () => {
    getOwner.mockResolvedValue({
      owner_id: validUuid,
      email: null,
      phone_e164: "+33600000000",
      email_verified_at: null,
      phone_verified_at: "2026-01-01T00:00:00Z"
    });
    upsertOwner.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    });
    const req = {
      method: "PATCH",
      headers: { "x-owner-id": validUuid },
      body: { phone: "+33611111111" }
    };
    const result = await handler(req);
    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({ phoneVerifiedAt: null })
    );
  });

  it("calls invalidateOwnerChallenges when email changes", async () => {
    getOwner.mockResolvedValue({
      owner_id: validUuid,
      email: "old@example.com",
      phone_e164: null,
      email_verified_at: null,
      phone_verified_at: null
    });
    upsertOwner.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: null
    });
    const req = {
      method: "PATCH",
      headers: { "x-owner-id": validUuid },
      body: { email: "new@example.com" }
    };
    await handler(req);
    expect(invalidateOwnerChallenges).toHaveBeenCalledWith({ ownerId: validUuid, type: "EMAIL" });
  });
});
