import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import {
  approveOauthDeviceAuthorization,
  createOauthDeviceAuthorization,
  incrementOauthUserCodeLookupFailure,
  markOauthDeviceAuthorizationExchanged,
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OAUTH_DEVICE_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("user-code lockout primitives", () => {

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
});

describe("device-code polling primitives", () => {

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
});

describe("device authorization lifecycle", () => {
  const now = new Date("2026-02-11T12:00:00.000Z");
  const future = "2026-02-11T12:10:00.000Z";

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
});
