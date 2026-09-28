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

import { handler } from "../../../../pages/api/v1/owner/[action]";
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
  return {
    authError: null,
    ownerId: validUuid,
    actor: { type: "owner", id: validUuid }
  };
}

describe("verify-email:start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects legacy x-owner-id without authenticated owner context", async () => {
    const req = { method: "POST", headers: { "x-owner-id": validUuid }, query: { action: "verify-email:start" }, body: {} };
    const result: any = await handler(req, null, {});
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(getOwner).not.toHaveBeenCalled();
  });

  it("does not echo token in production even when env flag is enabled", async () => {
    const mutableEnv = process.env as any;
    const previousNodeEnv = mutableEnv.NODE_ENV;
    const previousEcho = mutableEnv.OWNER_VERIFICATION_ECHO_TOKEN;
    mutableEnv.NODE_ENV = "production";
    mutableEnv.OWNER_VERIFICATION_ECHO_TOKEN = "true";

    try {
      getOwnerMock.mockResolvedValue({ owner_id: validUuid, email: "test@example.com" } as any);
      getLatestActiveChallengeMock.mockResolvedValue(null);
      createChallengeMock.mockResolvedValue({
        challenge_id: challengeId,
        expires_at: "2026-02-05T13:00:00Z"
      } as any);

      const result: any = await handler(makeReq("verify-email:start"), null, makeCtx());
      expect(result.status).toBe(201);
      expect(result.body.data.token).toBeUndefined();
    } finally {
      mutableEnv.NODE_ENV = previousNodeEnv;
      if (previousEcho === undefined) {
        delete mutableEnv.OWNER_VERIFICATION_ECHO_TOKEN;
      } else {
        mutableEnv.OWNER_VERIFICATION_ECHO_TOKEN = previousEcho;
      }
    }
  });
});
