import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./api-key-auth-cache", () => ({
  getCachedApiKeyAuthRecord: vi.fn(async () => null),
  setCachedApiKeyAuthRecord: vi.fn(async () => {}),
  deleteCachedApiKeyAuthRecord: vi.fn(async () => {})
}));

vi.mock("../utils/api-keys", async () => {
  const actual: any = await vi.importActual("../utils/api-keys");
  return {
    ...actual,
    verifyApiKeySecret: vi.fn(async () => true)
  };
});

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

const eq2ForUpdate = vi.fn(() => ({ error: null }));
const eq1ForUpdate = vi.fn(() => ({ eq: eq2ForUpdate }));
const update = vi.fn(() => ({ eq: eq1ForUpdate }));

const from = vi.fn(() => ({
  select,
  update
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({
    from
  })
}));

import { authenticateApiKey } from "./api-keys";
import { setCachedApiKeyAuthRecord } from "./api-key-auth-cache";

const API_KEY = "cd_live_abcdefgh.secret";

describe("authenticateApiKey (auth state)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts GRACE keys before expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-09T10:00:00Z"));

    maybeSingle.mockResolvedValue({
      data: {
        api_key_id: "key-1",
        agent_id: "agent-1",
        key_hash: "hash",
        key_state: "GRACE",
        grace_expires_at: "2026-02-09T11:00:00Z",
        revoked_at: null,
        agents: { owner_id: "owner-1" }
      },
      error: null
    });

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(true);
    expect(result.keyState).toBe("GRACE");
    expect(setCachedApiKeyAuthRecord).toHaveBeenCalledTimes(1);
  });

  it("rejects GRACE keys after expiry and revokes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-09T12:00:00Z"));

    maybeSingle.mockResolvedValue({
      data: {
        api_key_id: "key-1",
        agent_id: "agent-1",
        key_hash: "hash",
        key_state: "GRACE",
        grace_expires_at: "2026-02-09T11:00:00Z",
        revoked_at: null,
        agents: { owner_id: "owner-1" }
      },
      error: null
    });

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
    expect(update).toHaveBeenCalledTimes(1);
    expect(setCachedApiKeyAuthRecord).not.toHaveBeenCalled();
  });
});
