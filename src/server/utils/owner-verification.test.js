import { describe, expect, it } from "vitest";
import {
  evaluateChallenge,
  hashToken,
  isE164,
  normalizeEmail,
  normalizePhoneE164,
  verifyTokenHash
} from "./owner-verification";

describe("owner verification utils", () => {
  it("normalizes email", () => {
    expect(normalizeEmail(" Test@Example.COM ")).toBe("test@example.com");
    expect(normalizeEmail("")).toBeNull();
  });

  it("validates E.164 phones", () => {
    expect(isE164("+14155552671")).toBe(true);
    expect(isE164("14155552671")).toBe(false);
    expect(normalizePhoneE164(" +14155552671 ")).toBe("+14155552671");
  });

  it("hashes and verifies tokens", async () => {
    const token = "secret-token";
    const hash = await hashToken(token);
    await expect(verifyTokenHash(token, hash)).resolves.toBe(true);
    await expect(verifyTokenHash("nope", hash)).resolves.toBe(false);
  });

  it("evaluates challenge state", () => {
    const now = new Date("2026-02-05T00:00:00Z");
    const base = {
      expires_at: new Date(now.getTime() + 60_000).toISOString(),
      attempt_count: 0,
      max_attempts: 5,
      consumed_at: null
    };

    expect(evaluateChallenge(base, now).status).toBe("active");
    expect(evaluateChallenge({ ...base, attempt_count: 5 }, now).status).toBe("locked");
    expect(
      evaluateChallenge({ ...base, expires_at: new Date(now.getTime() - 60_000).toISOString() }, now)
        .status
    ).toBe("expired");
    expect(
      evaluateChallenge({ ...base, consumed_at: new Date(now.getTime() - 60_000).toISOString() }, now)
        .status
    ).toBe("consumed");
  });
});
