import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import {
  assertOauthDeviceUserCodeLookupAllowed,
  consumeOauthDeviceTokenPollAttempt,
  getOauthDeviceCodePollingState,
  getOauthUserCodeLockoutState,
  incrementOauthUserCodeLookupFailure,
  normalizeOauthUserCode,
  recordOauthDeviceUserCodeLookupAttempt,
  recordOauthDeviceCodePoll,
  resetOauthUserCodeLookupFailures,
  slowDownOauthDeviceCodePolling
} from "./oauth-device-authorizations";

const originalEnv = { ...process.env };

function createSelectChain(result: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

function createUpdateChain(result: any) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

function createInsertChain(result: any) {
  const chain: any = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

function createDeleteChain(result: any) {
  const chain: any = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OAUTH_DEVICE_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("normalizeOauthUserCode", () => {
  it("returns null for empty values", () => {
    expect(normalizeOauthUserCode(null)).toBeNull();
    expect(normalizeOauthUserCode(undefined)).toBeNull();
    expect(normalizeOauthUserCode("")).toBeNull();
    expect(normalizeOauthUserCode("   ")).toBeNull();
  });

  it("canonicalizes case and separators", () => {
    expect(normalizeOauthUserCode("abcd-efgh")).toBe("ABCD-EFGH");
    expect(normalizeOauthUserCode("abcd efgh")).toBe("ABCD-EFGH");
    expect(normalizeOauthUserCode("ABCD_EFGH")).toBe("ABCD-EFGH");
    expect(normalizeOauthUserCode("  AbCd.EfGh  ")).toBe("ABCD-EFGH");
  });

  it("rejects invalid length", () => {
    expect(normalizeOauthUserCode("ABC")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EFG")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EFGHI")).toBeNull();
  });

  it("rejects ambiguous characters (I/O/1/0)", () => {
    expect(normalizeOauthUserCode("ABCI-EFGH")).toBeNull();
    expect(normalizeOauthUserCode("ABCO-EFGH")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EF1H")).toBeNull();
    expect(normalizeOauthUserCode("ABCD-EF0H")).toBeNull();
  });

  it("accepts digits 2-9", () => {
    expect(normalizeOauthUserCode("23456789")).toBe("2345-6789");
  });
});

describe("user-code lockout primitives", () => {
  it("returns lockout state when user_code is currently locked", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const selectChain = createSelectChain({
      data: {
        attempt_count: 5,
        locked_until: "2026-02-11T12:00:42.000Z"
      },
      error: null
    });

    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => selectChain } as any);

    const state = await getOauthUserCodeLockoutState({
      userCode: "ABCD-EFGH",
      now
    });

    expect(state).toMatchObject({
      failed_attempts: 5,
      locked: true,
      retry_after_seconds: 42
    });
  });

  it("increments failed attempts and sets lockout window at threshold", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const selectChain = createSelectChain({
      data: {
        user_code_hash: "hash",
        attempt_count: 4,
        locked_until: null
      },
      error: null
    });
    const updateChain = createUpdateChain({
      data: {
        attempt_count: 5,
        locked_until: "2026-02-11T12:05:00.000Z"
      },
      error: null
    });

    const client: any = {
      from: vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await incrementOauthUserCodeLookupFailure({
      userCode: "ABCD-EFGH",
      maxFailedAttempts: 5,
      lockoutWindowSeconds: 300,
      now
    });

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt_count: 5,
        last_failed_at: now.toISOString(),
        locked_until: "2026-02-11T12:05:00.000Z"
      })
    );
    expect(result).toMatchObject({
      failed_attempts: 5,
      locked: true,
      retry_after_seconds: 300
    });
  });

  it("resets failed attempts after a prior lockout window has elapsed", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const selectChain = createSelectChain({
      data: {
        user_code_hash: "hash",
        attempt_count: 5,
        locked_until: "2026-02-11T11:59:00.000Z"
      },
      error: null
    });
    const updateChain = createUpdateChain({
      data: {
        attempt_count: 1,
        locked_until: null
      },
      error: null
    });
    const client: any = {
      from: vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await incrementOauthUserCodeLookupFailure({
      userCode: "ABCD-EFGH",
      maxFailedAttempts: 5,
      lockoutWindowSeconds: 300,
      now
    });

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt_count: 1,
        locked_until: null,
        last_failed_at: now.toISOString()
      })
    );
    expect(result).toMatchObject({
      failed_attempts: 1,
      locked: false,
      retry_after_seconds: 0
    });
  });

  it("retries with update when first insert loses a duplicate-key race", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const firstSelectChain = createSelectChain({
      data: null,
      error: null
    });
    const insertChain = createInsertChain({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint"
      }
    });
    const refetchChain = createSelectChain({
      data: {
        attempt_count: 1,
        locked_until: null
      },
      error: null
    });
    const updateChain = createUpdateChain({
      data: {
        attempt_count: 2,
        locked_until: null
      },
      error: null
    });
    const client: any = {
      from: vi
        .fn()
        .mockReturnValueOnce(firstSelectChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(refetchChain)
        .mockReturnValueOnce(updateChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await incrementOauthUserCodeLookupFailure({
      userCode: "ABCD-EFGH",
      maxFailedAttempts: 5,
      lockoutWindowSeconds: 300,
      now
    });

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt_count: 1,
        locked_until: null,
        created_at: now.toISOString()
      })
    );
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt_count: 2,
        locked_until: null,
        last_failed_at: now.toISOString()
      })
    );
    expect(result).toMatchObject({
      failed_attempts: 2,
      locked: false,
      retry_after_seconds: 0
    });
  });

  it("resets failed lookup counters on successful resolution", async () => {
    const deleteChain = createDeleteChain({
      data: {
        user_code_hash: "hash"
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => deleteChain } as any);

    const row = await resetOauthUserCodeLookupFailures({ userCode: "ABCD-EFGH" });

    expect(deleteChain.delete).toHaveBeenCalled();
    expect(row).toBeNull();
  });

  it("exposes lockout via assert hook", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const selectChain = createSelectChain({
      data: {
        attempt_count: 7,
        locked_until: "2026-02-11T12:00:20.000Z"
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => selectChain } as any);

    const response = await assertOauthDeviceUserCodeLookupAllowed({
      userCode: "ABCD-EFGH",
      now
    });

    expect(response).toMatchObject({
      status: 429,
      code: "DEVICE_AUTHORIZATION_LOCKED",
      retry_after_seconds: 20
    });
  });

  it("records failed lookup attempts via hook", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const selectChain = createSelectChain({
      data: {
        user_code_hash: "hash",
        attempt_count: 4,
        locked_until: null
      },
      error: null
    });
    const updateChain = createUpdateChain({
      data: {
        attempt_count: 5,
        locked_until: "2026-02-11T12:05:00.000Z"
      },
      error: null
    });
    const client: any = {
      from: vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const response = await recordOauthDeviceUserCodeLookupAttempt({
      userCode: "ABCD-EFGH",
      matched: false,
      success: false,
      now
    });

    expect(response).toMatchObject({
      status: 429,
      code: "DEVICE_AUTHORIZATION_LOCKED",
      retry_after_seconds: 300
    });
  });
});

describe("device-code polling primitives", () => {
  it("computes polling cadence state and retry_after", async () => {
    const now = new Date("2026-02-11T12:00:03.000Z");
    const selectChain = createSelectChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000010",
        poll_interval_seconds: 7,
        last_polled_at: "2026-02-11T12:00:00.000Z"
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => selectChain } as any);

    const state = await getOauthDeviceCodePollingState({
      deviceCode: "cd_dev_test_code",
      now
    });

    expect(state).toMatchObject({
      effective_interval_seconds: 7,
      poll_too_fast: true,
      retry_after_seconds: 4
    });
    expect(state.next_allowed_at).toBe("2026-02-11T12:00:07.000Z");
  });

  it("records last poll timestamp", async () => {
    const now = new Date("2026-02-11T12:00:10.000Z");
    const updateChain = createUpdateChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000011",
        poll_interval_seconds: 2,
        last_polled_at: now.toISOString()
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => updateChain } as any);

    const state = await recordOauthDeviceCodePoll({
      deviceCode: "cd_dev_test_code",
      now
    });

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_polled_at: now.toISOString(),
        updated_at: now.toISOString()
      })
    );
    expect(state).toMatchObject({
      effective_interval_seconds: 2,
      retry_after_seconds: 2
    });
  });

  it("supports slow_down interval increments with cap", async () => {
    const now = new Date("2026-02-11T12:00:20.000Z");
    const selectChain = createSelectChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000012",
        poll_interval_seconds: 58
      },
      error: null
    });
    const updateChain = createUpdateChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000012",
        poll_interval_seconds: 60,
        last_polled_at: now.toISOString()
      },
      error: null
    });
    const client: any = {
      from: vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const state = await slowDownOauthDeviceCodePolling({
      deviceCode: "cd_dev_test_code",
      incrementSeconds: 5,
      maxIntervalSeconds: 60,
      now
    });

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        poll_interval_seconds: 60,
        last_polled_at: now.toISOString(),
        updated_at: now.toISOString()
      })
    );
    expect(state.effective_interval_seconds).toBe(60);
  });

  it("consume hook returns slow_down when polling too quickly", async () => {
    const now = new Date("2026-02-11T12:00:03.000Z");
    const getStateChain = createSelectChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000015",
        poll_interval_seconds: 2,
        last_polled_at: "2026-02-11T12:00:02.000Z"
      },
      error: null
    });
    const slowDownSelectChain = createSelectChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000015",
        poll_interval_seconds: 2,
        last_polled_at: "2026-02-11T12:00:02.000Z"
      },
      error: null
    });
    const slowDownUpdateChain = createUpdateChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000015",
        poll_interval_seconds: 7,
        last_polled_at: now.toISOString()
      },
      error: null
    });
    const client: any = {
      from: vi
        .fn()
        .mockReturnValueOnce(getStateChain)
        .mockReturnValueOnce(slowDownSelectChain)
        .mockReturnValueOnce(slowDownUpdateChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const response = await consumeOauthDeviceTokenPollAttempt({
      deviceCode: "cd_dev_test_code",
      now
    });

    expect(response).toMatchObject({
      code: "slow_down",
      retry_after_seconds: 7
    });
  });

  it("consume hook records poll when interval is respected", async () => {
    const now = new Date("2026-02-11T12:00:10.000Z");
    const getStateChain = createSelectChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000016",
        poll_interval_seconds: 2,
        last_polled_at: "2026-02-11T12:00:00.000Z"
      },
      error: null
    });
    const recordChain = createUpdateChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000016",
        poll_interval_seconds: 2,
        last_polled_at: now.toISOString()
      },
      error: null
    });
    const client: any = {
      from: vi.fn().mockReturnValueOnce(getStateChain).mockReturnValueOnce(recordChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const response = await consumeOauthDeviceTokenPollAttempt({
      deviceCode: "cd_dev_test_code",
      now
    });

    expect(response).toBeNull();
    expect(recordChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_polled_at: now.toISOString()
      })
    );
  });

  it("consume hook can use preloaded authorization to avoid an extra read", async () => {
    const now = new Date("2026-02-11T12:00:10.000Z");
    const recordChain = createUpdateChain({
      data: {
        authorization_id: "00000000-0000-4000-8000-000000000017",
        poll_interval_seconds: 2,
        last_polled_at: now.toISOString()
      },
      error: null
    });
    const client: any = {
      from: vi.fn().mockReturnValue(recordChain)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const response = await consumeOauthDeviceTokenPollAttempt({
      authorization: {
        authorization_id: "00000000-0000-4000-8000-000000000017",
        poll_interval_seconds: 2,
        last_polled_at: "2026-02-11T12:00:00.000Z"
      },
      deviceCode: "cd_dev_test_code",
      now
    });

    expect(response).toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(recordChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_polled_at: now.toISOString()
      })
    );
  });
});
