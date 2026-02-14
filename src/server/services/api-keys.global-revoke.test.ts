import { beforeEach, describe, expect, it, vi } from "vitest";

const { listResultRef, revokeResultRef } = vi.hoisted(() => ({
  listResultRef: { data: [] as any[], error: null as any },
  revokeResultRef: { data: [] as any[], error: null as any }
}));

const { deleteCachedApiKeyAuthRecordMock } = vi.hoisted(() => ({
  deleteCachedApiKeyAuthRecordMock: vi.fn(async () => {})
}));

vi.mock("./api-key-auth-cache", () => ({
  getCachedApiKeyAuthRecord: vi.fn(async () => null),
  setCachedApiKeyAuthRecord: vi.fn(async () => {}),
  deleteCachedApiKeyAuthRecord: deleteCachedApiKeyAuthRecordMock
}));

const listIn = vi.fn(async () => ({
  data: listResultRef.data,
  error: listResultRef.error
}));
const listIs = vi.fn(() => ({ in: listIn }));
const listEq = vi.fn(() => ({ is: listIs }));
const listSelect = vi.fn(() => ({ eq: listEq }));

const updateSelect = vi.fn(async () => ({
  data: revokeResultRef.data,
  error: revokeResultRef.error
}));
const updateIn = vi.fn(() => ({ select: updateSelect }));
const updateIs = vi.fn(() => ({ in: updateIn }));
const updateEq = vi.fn(() => ({ is: updateIs }));
const update = vi.fn(() => ({ eq: updateEq }));

const from = vi.fn(() => ({
  select: listSelect,
  update
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({
    from
  })
}));

import { revokeGlobalApiKeysForAgent } from "./api-keys";

describe("revokeGlobalApiKeysForAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResultRef.data = [];
    listResultRef.error = null;
    revokeResultRef.data = [];
    revokeResultRef.error = null;
  });

  it("revokes ACTIVE/GRACE global keys and invalidates cache prefixes", async () => {
    listResultRef.data = [
      { api_key_id: "11111111-1111-4111-8111-111111111111", key_prefix: "pref1" },
      { api_key_id: "22222222-2222-4222-8222-222222222222", key_prefix: "pref2" }
    ];
    revokeResultRef.data = [
      { api_key_id: "11111111-1111-4111-8111-111111111111", key_prefix: "pref1" },
      { api_key_id: "22222222-2222-4222-8222-222222222222", key_prefix: "pref2" }
    ];

    const result: any = await revokeGlobalApiKeysForAgent({
      agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      now: new Date("2026-02-14T12:00:00.000Z")
    });

    expect(result.revokedGlobalKeysCount).toBe(2);
    expect(result.revokedGlobalApiKeyIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    ]);
    expect(deleteCachedApiKeyAuthRecordMock).toHaveBeenCalledTimes(2);
    expect(deleteCachedApiKeyAuthRecordMock).toHaveBeenCalledWith("pref1");
    expect(deleteCachedApiKeyAuthRecordMock).toHaveBeenCalledWith("pref2");
  });

  it("returns no-op when no global keys are active", async () => {
    listResultRef.data = [];

    const result: any = await revokeGlobalApiKeysForAgent({
      agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });

    expect(result.revokedGlobalKeysCount).toBe(0);
    expect(result.revokedGlobalApiKeyIds).toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(deleteCachedApiKeyAuthRecordMock).not.toHaveBeenCalled();
  });

  it("validates required agentId", async () => {
    await expect(revokeGlobalApiKeysForAgent({ agentId: null })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400
    });
  });
});
