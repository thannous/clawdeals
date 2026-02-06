import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn(),
  setOwnerVerified: vi.fn()
}));

vi.mock("../../../../server/services/owner-verification", () => ({
  getLatestActiveChallenge: vi.fn(),
  createChallenge: vi.fn(),
  evaluateChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
  incrementChallengeAttempt: vi.fn()
}));

vi.mock("../../../../server/utils/owner-verification", () => ({
  OWNER_VERIFICATION: { emailExpirySeconds: 3600, phoneExpirySeconds: 300, maxAttempts: 5 },
  computeExpiryDate: vi.fn((sec, now) => new Date(now.getTime() + sec * 1000).toISOString()),
  generateEmailToken: vi.fn(() => "test-token-123"),
  generatePhoneOtp: vi.fn(() => "123456"),
  hashToken: vi.fn(async () => "hashed-token"),
  normalizePhoneE164: vi.fn((v) => v || null),
  secondsUntil: vi.fn(() => 60),
  verifyTokenHash: vi.fn()
}));

import { handler } from "./[action]";
import { getOwner, setOwnerVerified } from "../../../../server/services/owners";
import {
  getLatestActiveChallenge,
  createChallenge,
  evaluateChallenge,
  consumeChallenge,
  incrementChallengeAttempt
} from "../../../../server/services/owner-verification";
import { verifyTokenHash } from "../../../../server/utils/owner-verification";

const validUuid = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const challengeId = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

const getOwnerMock = vi.mocked(getOwner);
const setOwnerVerifiedMock = vi.mocked(setOwnerVerified);

const getLatestActiveChallengeMock = vi.mocked(getLatestActiveChallenge);
const createChallengeMock = vi.mocked(createChallenge);
const evaluateChallengeMock = vi.mocked(evaluateChallenge);
const incrementChallengeAttemptMock = vi.mocked(incrementChallengeAttempt);

const verifyTokenHashMock = vi.mocked(verifyTokenHash);

function makeReq(action, body = {}, headers = {}) {
  return {
    method: "POST",
    headers: { "x-owner-id": validUuid, ...headers },
    query: { action },
    body
  };
}

function makeCtx(): any {
  return {};
}

describe("verify-email:start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without x-owner-id", async () => {
    const req = { method: "POST", headers: {}, query: { action: "verify-email:start" }, body: {} };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("x-owner-id");
  });

  it("returns 404 when owner not found", async () => {
    getOwnerMock.mockResolvedValue(null);
    const result: any = await handler(makeReq("verify-email:start"), null, makeCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 when owner has no email", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: null } as any);
    const result: any = await handler(makeReq("verify-email:start"), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("email");
  });

  it("returns 201 with challenge_id and expires_at", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue(null);
    createChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      expires_at: "2026-02-05T13:00:00Z"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("verify-email:start"), null, ctx);
    expect(result.status).toBe(201);
    expect(result.body.data.challenge_id).toBe(challengeId);
    expect(result.body.data.expires_at).toBeTruthy();
    expect(ctx.auditEvent).toBe("owner.email_verification_started");
  });

  it("echoes token in non-production", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue(null);
    createChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      expires_at: "2026-02-05T13:00:00Z"
    } as any);
    const result: any = await handler(makeReq("verify-email:start"), null, makeCtx());
    expect(result.body.data.token).toBe("test-token-123");
  });

  it("returns 429 lockout when challenge locked", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({ challenge_id: challengeId } as any);
    evaluateChallengeMock.mockReturnValue({ status: "locked", retryAfterSeconds: 300 } as any);

    const result: any = await handler(makeReq("verify-email:start"), null, makeCtx());
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe("CHALLENGE_LOCKED");
    expect(result.headers["Retry-After"]).toBe("300");
  });

  it("consumes active challenge before creating new one", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    const existing = { challenge_id: "old-id" };
    getLatestActiveChallengeMock.mockResolvedValue(existing as any);
    evaluateChallengeMock.mockReturnValue({ status: "active" } as any);
    createChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      expires_at: "2026-02-05T13:00:00Z"
    } as any);

    await handler(makeReq("verify-email:start"), null, makeCtx());
    expect(consumeChallenge).toHaveBeenCalledWith("old-id", expect.any(Date));
    expect(createChallenge).toHaveBeenCalled();
  });
});

describe("verify-email:confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without token", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    const result: any = await handler(makeReq("verify-email:confirm", {}), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("token");
  });

  it("returns 404 when no active challenge", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue(null);
    const result: any = await handler(makeReq("verify-email:confirm", { token: "abc" }), null, makeCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when challenge expired", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({ challenge_id: challengeId, token_hash: "hash" } as any);
    evaluateChallengeMock.mockReturnValue({ status: "expired" } as any);
    const result: any = await handler(makeReq("verify-email:confirm", { token: "abc" }), null, makeCtx());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CHALLENGE_EXPIRED");
  });

  it("returns 409 when challenge consumed", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({ challenge_id: challengeId, token_hash: "hash" } as any);
    evaluateChallengeMock.mockReturnValue({ status: "consumed" } as any);
    const result: any = await handler(makeReq("verify-email:confirm", { token: "abc" }), null, makeCtx());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CHALLENGE_CONSUMED");
  });

  it("returns 400 INVALID_TOKEN with remaining_attempts on wrong token", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      token_hash: "hash",
      attempt_count: 1,
      max_attempts: 5
    } as any);
    evaluateChallengeMock.mockReturnValue({ status: "active" } as any);
    verifyTokenHashMock.mockResolvedValue(false);
    incrementChallengeAttemptMock.mockResolvedValue({ max_attempts: 5 } as any);

    const result: any = await handler(makeReq("verify-email:confirm", { token: "wrong" }), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_TOKEN");
    expect(result.body.error.details.remaining_attempts).toBeDefined();
  });

  it("returns 429 lockout after max attempts", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      token_hash: "hash",
      attempt_count: 4,
      max_attempts: 5
    } as any);
    evaluateChallengeMock.mockReturnValue({ status: "active" } as any);
    verifyTokenHashMock.mockResolvedValue(false);
    incrementChallengeAttemptMock.mockResolvedValue({
      max_attempts: 5,
      expires_at: "2026-02-05T13:00:00Z"
    } as any);

    const result: any = await handler(makeReq("verify-email:confirm", { token: "wrong" }), null, makeCtx());
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe("CHALLENGE_LOCKED");
  });

  it("returns 200 with verified owner on correct token", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      token_hash: "hash",
      attempt_count: 0,
      max_attempts: 5
    } as any);
    evaluateChallengeMock.mockReturnValue({ status: "active" } as any);
    verifyTokenHashMock.mockResolvedValue(true);
    setOwnerVerifiedMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: "2026-02-05T12:00:00Z",
      phone_verified_at: null
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("verify-email:confirm", { token: "correct" }), null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.email_verified_at).toBeTruthy();
    expect(ctx.auditEvent).toBe("owner.email_verified");
    expect(consumeChallenge).toHaveBeenCalledWith(challengeId, expect.any(Date));
  });
});

describe("verify-phone:start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when owner has no phone", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, phone_e164: null } as any);
    const result: any = await handler(makeReq("verify-phone:start"), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("phone");
  });

  it("returns 201 with code in dev", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, phone_e164: "+33600000000" } as any);
    getLatestActiveChallengeMock.mockResolvedValue(null);
    createChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      expires_at: "2026-02-05T13:00:00Z"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("verify-phone:start"), null, ctx);
    expect(result.status).toBe(201);
    expect(result.body.data.code).toBe("123456");
    expect(ctx.auditEvent).toBe("owner.phone_verification_started");
  });
});

describe("verify-phone:confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with verified owner", async () => {
    getOwnerMock.mockResolvedValue({ owner_id: validUuid, phone_e164: "+33600000000" } as any);
    getLatestActiveChallengeMock.mockResolvedValue({
      challenge_id: challengeId,
      token_hash: "hash",
      attempt_count: 0,
      max_attempts: 5
    } as any);
    evaluateChallengeMock.mockReturnValue({ status: "active" } as any);
    verifyTokenHashMock.mockResolvedValue(true);
    setOwnerVerifiedMock.mockResolvedValue({
      owner_id: validUuid,
      email_verified_at: null,
      phone_verified_at: "2026-02-05T12:00:00Z"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("verify-phone:confirm", { code: "123456" }), null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.phone_verified_at).toBeTruthy();
    expect(ctx.auditEvent).toBe("owner.phone_verified");
  });
});

describe("unknown action", () => {
  it("returns 404 for unknown action", async () => {
    const result: any = await handler(makeReq("unknown-action"), null, makeCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 405 for GET", async () => {
    const req = { method: "GET", headers: { "x-owner-id": validUuid }, query: { action: "verify-email:start" } };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(405);
  });
});
