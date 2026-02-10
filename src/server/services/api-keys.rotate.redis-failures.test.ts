import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(async () => null),
  set: vi.fn(async () => "OK"),
  del: vi.fn(async () => 1)
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis
}));

vi.mock("../utils/api-keys", async () => {
  const actual: any = await vi.importActual("../utils/api-keys");
  return {
    ...actual,
    generateApiKey: vi.fn(() => ({
      apiKey: "cd_live_newprefix.newsecret",
      prefix: "newprefix",
      secret: "newsecret"
    })),
    hashApiKeySecret: vi.fn(async () => "hash")
  };
});

const isForList = vi.fn();
const in_ = vi.fn(() => ({ is: isForList }));
const eqForList = vi.fn(() => ({ in: in_ }));
const selectForList = vi.fn(() => ({ eq: eqForList }));

const maybeSingle = vi.fn();
const selectForUpdate = vi.fn(() => ({ maybeSingle }));
const eq2ForUpdate = vi.fn(() => ({ select: selectForUpdate }));
const eq1ForUpdate = vi.fn(() => ({ eq: eq2ForUpdate }));
const update = vi.fn(() => ({ eq: eq1ForUpdate }));

const single = vi.fn();
const selectForInsert = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: selectForInsert }));

const from = vi.fn(() => ({
  select: selectForList,
  update,
  insert
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({
    from
  })
}));

import { rotateApiKeyForAgent } from "./api-keys";

describe("rotateApiKeyForAgent (Redis failures)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isForList.mockResolvedValue({
      data: [{ api_key_id: "key-active", key_state: "ACTIVE", key_prefix: "abcdefgh" }],
      error: null
    });
    maybeSingle.mockResolvedValue({
      data: { api_key_id: "key-active" },
      error: null
    });
    single.mockResolvedValue({
      data: { api_key_id: "key-new" },
      error: null
    });
  });

  it("does not fail rotation if Redis cache invalidation throws", async () => {
    mockRedis.del.mockRejectedValueOnce(new Error("redis down"));

    const result: any = await rotateApiKeyForAgent({ agentId: "agent-1", graceSeconds: 60 });
    expect(result.apiKey).toBe("cd_live_newprefix.newsecret");
    expect(result.apiKeyId).toBe("key-new");
    expect(result.previousApiKeyId).toBe("key-active");
  });
});
