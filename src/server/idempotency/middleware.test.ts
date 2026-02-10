import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedis = {
  set: vi.fn(),
  del: vi.fn()
};

let redisAvailable = true;
vi.mock("../redis/upstash", () => ({
  getRedis: () => {
    if (!redisAvailable) throw new Error("Redis unavailable");
    return mockRedis;
  }
}));

vi.mock("./store", () => ({
  getIdempotencyRecord: vi.fn(),
  insertIdempotencyRecord: vi.fn(),
  updateIdempotencyRecord: vi.fn(),
  deleteIdempotencyRecord: vi.fn()
}));

vi.mock("./crypto", () => ({
  buildRequestHmac: vi.fn(() => "hmac-abc"),
  shouldEncryptResponseBody: vi.fn(() => false),
  encryptJson: vi.fn(() => "v1:encrypted"),
  decryptJson: vi.fn(() => ({ data: { api_key: "cd_live_test.secret" } }))
}));

vi.mock("../utils/canonical-json", () => ({
  canonicalJsonStringify: vi.fn(() => "{}")
}));

import { beginIdempotency, finalizeIdempotency } from "./middleware";
import {
  getIdempotencyRecord,
  insertIdempotencyRecord,
  updateIdempotencyRecord,
  deleteIdempotencyRecord
} from "./store";
import { buildRequestHmac, shouldEncryptResponseBody, encryptJson } from "./crypto";

function makeReq(headers = {}, query = {}) {
  return {
    headers: { "idempotency-key": "test-key", ...headers },
    query
  };
}

function makeCtx(overrides = {}) {
  return {
    actor: { type: "agent", id: "agent-1" },
    agentId: "agent-1",
    method: "POST",
    path: "/api/v1/reports",
    body: {},
    ip: "127.0.0.1",
    ...overrides
  };
}

describe("beginIdempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDEMPOTENCY_SECRET = "test-secret";
    redisAvailable = true;
    (buildRequestHmac as any).mockReturnValue("hmac-abc");
  });

  it("skips when not enabled", async () => {
    const result = await beginIdempotency(makeReq(), makeCtx(), { enabled: false });
    expect(result.action).toBe("skip");
  });

  it("skips without idempotency-key header", async () => {
    const req = { headers: {}, query: {} };
    const result = await beginIdempotency(req, makeCtx(), { enabled: true });
    expect(result.action).toBe("skip");
  });

  it("returns error for invalid key format", async () => {
    const req = { headers: { "idempotency-key": "\x00bad" }, query: {} };
    const result = await beginIdempotency(req, makeCtx(), { enabled: true });
    expect(result.action).toBe("error");
    expect(result.response.status).toBe(400);
    expect(result.response.body.error.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  it("returns error for key exceeding max length", async () => {
    const req = { headers: { "idempotency-key": "a".repeat(200) }, query: {} };
    const result = await beginIdempotency(req, makeCtx(), { enabled: true });
    expect(result.action).toBe("error");
    expect(result.response.status).toBe(400);
  });

  it("continues when lock acquired and no existing record", async () => {
    mockRedis.set.mockResolvedValue("OK");
    (getIdempotencyRecord as any).mockResolvedValue(null);
    (insertIdempotencyRecord as any).mockResolvedValue({ idempotency_id: "idem-1", status: "IN_PROGRESS" });

    const result = await beginIdempotency(makeReq(), makeCtx(), { enabled: true });
    expect(result.action).toBe("continue");
    expect((result as any).context.key).toBe("test-key");
  });

  it("replays when COMPLETED record exists with matching HMAC", async () => {
    mockRedis.set.mockResolvedValue("OK");
    (getIdempotencyRecord as any).mockResolvedValue({
      idempotency_id: "idem-1",
      status: "COMPLETED",
      request_hmac: "hmac-abc",
      response_status: 201,
      response_body: { data: { id: "1" } },
      response_headers: {}
    });

    const result = await beginIdempotency(makeReq(), makeCtx(), { enabled: true });
    expect(result.action).toBe("replay");
    expect(result.response.status).toBe(201);
    expect(result.response.body).toEqual({ data: { id: "1" } });
    expect(result.response.headers["Idempotency-Replayed"]).toBe("true");
  });

  it("returns 409 KEY_REUSE on HMAC mismatch", async () => {
    mockRedis.set.mockResolvedValue("OK");
    (buildRequestHmac as any).mockReturnValue("hmac-different");
    (getIdempotencyRecord as any).mockResolvedValue({
      idempotency_id: "idem-1",
      status: "COMPLETED",
      request_hmac: "hmac-original",
      response_status: 201,
      response_body: {},
      response_headers: {}
    });

    const result = await beginIdempotency(makeReq(), makeCtx(), { enabled: true });
    expect(result.action).toBe("error");
    expect(result.response.status).toBe(409);
    expect(result.response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  it("returns IN_PROGRESS when lock not acquired and poll times out", async () => {
    mockRedis.set.mockResolvedValue(null);
    (getIdempotencyRecord as any).mockResolvedValue(null);

    const result = await beginIdempotency(makeReq(), makeCtx(), {
      enabled: true,
      maxWaitMs: 100
    });
    expect(result.action).toBe("error");
    expect(result.response.status).toBe(409);
    expect(result.response.body.error.code).toBe("IDEMPOTENCY_IN_PROGRESS");
  });

  it("does not double-execute in DB-only mode when insert races (unique violation)", async () => {
    redisAvailable = false;
    (getIdempotencyRecord as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        idempotency_id: "idem-1",
        status: "IN_PROGRESS",
        request_hmac: "hmac:hmac-abc"
      })
      .mockResolvedValueOnce({
        idempotency_id: "idem-1",
        status: "COMPLETED",
        request_hmac: "hmac:hmac-abc",
        response_status: 201,
        response_body: { ok: true },
        response_headers: {}
      });
    (insertIdempotencyRecord as any).mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));

    const result = await beginIdempotency(makeReq(), makeCtx(), { enabled: true, maxWaitMs: 50 });
    expect(result.action).toBe("replay");
    expect(result.response.status).toBe(201);
    expect(result.response.body).toEqual({ ok: true });
  });

  it("returns 409 KEY_REUSE in DB-only mode when insert races and fingerprint mismatches", async () => {
    redisAvailable = false;
    (buildRequestHmac as any).mockReturnValue("hmac-different");
    (getIdempotencyRecord as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        idempotency_id: "idem-1",
        status: "IN_PROGRESS",
        request_hmac: "hmac:hmac-original"
      });
    (insertIdempotencyRecord as any).mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));

    const result = await beginIdempotency(makeReq(), makeCtx(), { enabled: true, maxWaitMs: 50 });
    expect(result.action).toBe("error");
    expect(result.response.status).toBe(409);
    expect(result.response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  it("skips when no actor id available", async () => {
    const ctx = makeCtx({ actor: { type: null, id: null }, agentId: null });
    const result = await beginIdempotency(makeReq(), ctx, { enabled: true });
    expect(result.action).toBe("skip");
  });
});

describe("finalizeIdempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDEMPOTENCY_SECRET = "test-secret";
  });

  it("does nothing without context", async () => {
    await finalizeIdempotency(null, { status: 200 });
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("deletes lock key", async () => {
    const context = {
      lockKey: "idem:lock:agent:1:POST:/api:key",
      record: { idempotency_id: "idem-1" }
    };
    (shouldEncryptResponseBody as any).mockReturnValue(false);
    (updateIdempotencyRecord as any).mockResolvedValue({});

    await finalizeIdempotency(context, { status: 200, body: {}, headers: {} });
    expect(mockRedis.del).toHaveBeenCalledWith("idem:lock:agent:1:POST:/api:key");
  });

  it("deletes record for 400 response", async () => {
    const context = {
      lockKey: "lock-key",
      record: { idempotency_id: "idem-1" }
    };
    await finalizeIdempotency(context, { status: 400, body: {}, headers: {} });
    expect(deleteIdempotencyRecord).toHaveBeenCalledWith("idem-1");
  });

  it("deletes record for 429 response", async () => {
    const context = {
      lockKey: "lock-key",
      record: { idempotency_id: "idem-1" }
    };
    await finalizeIdempotency(context, { status: 429, body: {}, headers: {} });
    expect(deleteIdempotencyRecord).toHaveBeenCalledWith("idem-1");
  });

  it("stores COMPLETED for 2xx response", async () => {
    const context = {
      lockKey: "lock-key",
      record: { idempotency_id: "idem-1" }
    };
    (shouldEncryptResponseBody as any).mockReturnValue(false);
    (updateIdempotencyRecord as any).mockResolvedValue({});

    await finalizeIdempotency(context, { status: 201, body: { data: { id: "1" } }, headers: {} });
    expect(updateIdempotencyRecord).toHaveBeenCalledWith(
      "idem-1",
      expect.objectContaining({ status: "COMPLETED", response_status: 201 })
    );
  });

  it("stores FAILED for 5xx response", async () => {
    const context = {
      lockKey: "lock-key",
      record: { idempotency_id: "idem-1" }
    };
    (shouldEncryptResponseBody as any).mockReturnValue(false);
    (updateIdempotencyRecord as any).mockResolvedValue({});

    await finalizeIdempotency(context, { status: 500, body: { error: {} }, headers: {} });
    expect(updateIdempotencyRecord).toHaveBeenCalledWith(
      "idem-1",
      expect.objectContaining({ status: "FAILED", response_status: 500 })
    );
  });

  it("encrypts body when sensitive keys present", async () => {
    const context = {
      lockKey: "lock-key",
      record: { idempotency_id: "idem-1" }
    };
    (shouldEncryptResponseBody as any).mockReturnValue(true);
    (encryptJson as any).mockReturnValue("v1:encrypted-data");
    (updateIdempotencyRecord as any).mockResolvedValue({});

    await finalizeIdempotency(context, {
      status: 201,
      body: { data: { api_key: "cd_live_test.secret" } },
      headers: {}
    });
    expect(encryptJson).toHaveBeenCalled();
    expect(updateIdempotencyRecord).toHaveBeenCalledWith(
      "idem-1",
      expect.objectContaining({
        response_body: null,
        response_body_encrypted: "v1:encrypted-data"
      })
    );
  });
});
