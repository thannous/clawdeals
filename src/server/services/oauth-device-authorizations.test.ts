import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import {
  approveOauthDeviceAuthorization,
  assertOauthDeviceUserCodeLookupAllowed,
  consumeOauthDeviceTokenPollAttempt,
  createOauthDeviceAuthorization,
  denyOauthDeviceAuthorization,
  getOauthDeviceAuthorizationByDeviceCode,
  getOauthDeviceAuthorizationByUserCode,
  getOauthDeviceCodePollingState,
  getOauthUserCodeLockoutState,
  incrementOauthUserCodeLookupFailure,
  markOauthDeviceAuthorizationExchanged,
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
    gt: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

function createInsertChain(result: any) {
  const chain: any = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result)
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

describe("device authorization lifecycle", () => {
  const now = new Date("2026-02-11T12:00:00.000Z");
  const future = "2026-02-11T12:10:00.000Z";
  const past = "2026-02-11T11:59:00.000Z";

  it("validates creation and persists normalized authorization metadata", async () => {
    await expect(createOauthDeviceAuthorization({
      clientId: "   ",
      now
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const inserted = {
      authorization_id: "authorization_1",
      status: "PENDING",
      expires_at: future
    };
    const insertChain = createInsertChain({ data: inserted, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => insertChain)
    } as any);

    const result = await createOauthDeviceAuthorization({
      clientId: `  ${"client".repeat(20)}  `,
      requestedScopes: ["agent:read", "", null, " deals:read "],
      requestedAgentName: "  Test agent  ",
      ipTruncated: "  192.0.2.0/24  ",
      uaHash: ` ${"a".repeat(140)} `,
      expiresAt: new Date(future),
      now
    });

    expect(result.authorization).toEqual(inserted);
    expect(result.device_code).toMatch(/^cd_dev_[A-Za-z0-9_-]+$/);
    expect(result.user_code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: "PENDING",
      client_id: expect.stringMatching(/^client/),
      requested_scopes: ["agent:read", "deals:read"],
      requested_agent_name: "Test agent",
      ip_truncated: "192.0.2.0/24",
      ua_hash: "a".repeat(128),
      created_at: now.toISOString(),
      expires_at: future,
      device_code_hash: expect.not.stringContaining("cd_dev_"),
      user_code_hash: expect.any(String)
    }));
    expect(insertChain.insert.mock.calls[0][0].client_id).toHaveLength(80);
  });

  it("retries code collisions and fails closed after the bounded attempt count", async () => {
    const collisionChain = createInsertChain({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" }
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => collisionChain)
    } as any);

    await expect(createOauthDeviceAuthorization({
      clientId: "openclaw",
      now
    })).rejects.toMatchObject({
      status: 500,
      code: "CODE_GENERATION_FAILED"
    });
    expect(collisionChain.single).toHaveBeenCalledTimes(10);

    const failureChain = createInsertChain({
      data: null,
      error: { code: "PGRST500", message: "insert unavailable" }
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => failureChain)
    } as any);
    await expect(createOauthDeviceAuthorization({
      clientId: "openclaw",
      now
    })).rejects.toMatchObject({ message: "insert unavailable" });
  });

  it("loads by user code and atomically expires stale pending requests", async () => {
    const pending = {
      authorization_id: "authorization_expired",
      user_code_hash: "stored-user-hash",
      status: "PENDING",
      expires_at: past
    };
    const lookup = createSelectChain({ data: pending, error: null });
    const expired = {
      ...pending,
      status: "EXPIRED",
      expired_at: now.toISOString()
    };
    const expire = createUpdateChain({ data: expired, error: null });
    const client = {
      from: vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(expire)
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);

    await expect(getOauthDeviceAuthorizationByUserCode({
      userCode: "ABCD-EFGH",
      now
    })).resolves.toEqual(expired);
    expect(expire.update).toHaveBeenCalledWith({
      status: "EXPIRED",
      expired_at: now.toISOString(),
      updated_at: now.toISOString()
    });
    expect(expire.eq).toHaveBeenCalledWith("status", "PENDING");
  });

  it("loads authorized device codes without mutating them and rejects missing codes", async () => {
    await expect(getOauthDeviceAuthorizationByDeviceCode({
      deviceCode: "bad-code",
      now
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const authorized = {
      authorization_id: "authorization_authorized",
      status: "AUTHORIZED",
      expires_at: future
    };
    const lookup = createSelectChain({ data: authorized, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => lookup)
    } as any);
    await expect(getOauthDeviceAuthorizationByDeviceCode({
      deviceCode: "cd_dev_valid_code",
      now
    })).resolves.toEqual(authorized);

    const missing = createSelectChain({ data: null, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => missing)
    } as any);
    await expect(getOauthDeviceAuthorizationByUserCode({
      userCode: "ABCD-EFGH",
      now
    })).rejects.toMatchObject({
      status: 404,
      code: "DEVICE_AUTHORIZATION_NOT_FOUND"
    });
  });

  it("marks an authorized code exchanged with an idempotence guard", async () => {
    const exchanged = {
      authorization_id: "authorization_1",
      status: "AUTHORIZED",
      exchanged_at: now.toISOString(),
      expires_at: future
    };
    const update = createUpdateChain({ data: exchanged, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => update)
    } as any);

    await expect(markOauthDeviceAuthorizationExchanged({
      authorizationId: "authorization_1",
      deviceCode: "cd_dev_valid_code",
      now
    })).resolves.toEqual(exchanged);
    expect(update.is).toHaveBeenCalledWith("exchanged_at", null);
    expect(update.gt).toHaveBeenCalledWith("expires_at", now.toISOString());
  });

  it("classifies losing exchange races without issuing a second credential", async () => {
    const update = createUpdateChain({ data: null, error: null });
    const alreadyExchanged = createSelectChain({
      data: {
        authorization_id: "authorization_1",
        status: "AUTHORIZED",
        exchanged_at: "2026-02-11T11:59:00.000Z",
        expires_at: future
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValueOnce(update).mockReturnValueOnce(alreadyExchanged)
    } as any);
    await expect(markOauthDeviceAuthorizationExchanged({
      authorizationId: "authorization_1",
      deviceCode: "cd_dev_valid_code",
      now
    })).rejects.toMatchObject({ status: 409, code: "DEVICE_CODE_ALREADY_EXCHANGED" });

    const deniedUpdate = createUpdateChain({ data: null, error: null });
    const denied = createSelectChain({
      data: {
        authorization_id: "authorization_2",
        status: "DENIED",
        exchanged_at: null,
        expires_at: future
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValueOnce(deniedUpdate).mockReturnValueOnce(denied)
    } as any);
    await expect(markOauthDeviceAuthorizationExchanged({
      authorizationId: "authorization_2",
      deviceCode: "cd_dev_valid_code",
      now
    })).rejects.toMatchObject({ status: 409, code: "DEVICE_AUTHORIZATION_DENIED" });
  });

  it("approves a pending authorization with owner and agent binding", async () => {
    await expect(approveOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      ownerId: "",
      agentId: "agent_1",
      now
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(approveOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      ownerId: "owner_1",
      agentId: null,
      now
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const approved = {
      authorization_id: "authorization_approved",
      status: "AUTHORIZED",
      owner_id: "owner_1",
      agent_id: "agent_1",
      expires_at: future
    };
    const update = createUpdateChain({ data: approved, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => update)
    } as any);
    await expect(approveOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      ownerId: " owner_1 ",
      agentId: " agent_1 ",
      now
    })).resolves.toEqual(approved);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "AUTHORIZED",
      owner_id: "owner_1",
      agent_id: "agent_1"
    }));
  });

  it("classifies failed approval transitions after a concurrent state change", async () => {
    const update = createUpdateChain({ data: null, error: null });
    const denied = createSelectChain({
      data: {
        authorization_id: "authorization_denied",
        status: "DENIED",
        expires_at: future
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValueOnce(update).mockReturnValueOnce(denied)
    } as any);

    await expect(approveOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      ownerId: "owner_1",
      agentId: "agent_1",
      now
    })).rejects.toMatchObject({ status: 409, code: "DEVICE_AUTHORIZATION_DENIED" });
  });

  it("denies once and treats repeated denies as idempotent", async () => {
    const denied = {
      authorization_id: "authorization_denied",
      status: "DENIED",
      denied_at: now.toISOString(),
      expires_at: future
    };
    const update = createUpdateChain({ data: denied, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => update)
    } as any);
    await expect(denyOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      now
    })).resolves.toEqual(denied);

    const lostUpdate = createUpdateChain({ data: null, error: null });
    const lookup = createSelectChain({ data: denied, error: null });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValueOnce(lostUpdate).mockReturnValueOnce(lookup)
    } as any);
    await expect(denyOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      now
    })).resolves.toEqual(denied);
  });

  it("rejects denial after authorization and maps Supabase transition errors", async () => {
    const lostUpdate = createUpdateChain({ data: null, error: null });
    const authorized = createSelectChain({
      data: {
        authorization_id: "authorization_authorized",
        status: "AUTHORIZED",
        expires_at: future
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValueOnce(lostUpdate).mockReturnValueOnce(authorized)
    } as any);
    await expect(denyOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      now
    })).rejects.toMatchObject({
      status: 409,
      code: "DEVICE_AUTHORIZATION_ALREADY_AUTHORIZED"
    });

    const failedUpdate = createUpdateChain({
      data: null,
      error: { code: "PGRST500", message: "transition unavailable" }
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => failedUpdate)
    } as any);
    await expect(denyOauthDeviceAuthorization({
      userCode: "ABCD-EFGH",
      now
    })).rejects.toMatchObject({ message: "transition unavailable" });
  });
});
