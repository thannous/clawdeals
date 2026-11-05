import crypto from "node:crypto";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptJson, decryptJson } from "./crypto";
import { beginIdempotency, finalizeIdempotency } from "./middleware";
import { sendJson, type JsonResponse } from "../http/response";

// Browser journeys cannot observe storage at rest or reliably seed malformed,
// legacy and wrong-key records. Exercise the real cipher and middleware here,
// substituting only persistence/Redis and using entirely synthetic credentials.
const store = vi.hoisted(() => ({
  get: vi.fn(), insert: vi.fn(), update: vi.fn(), remove: vi.fn(), claim: vi.fn()
}));
vi.mock("./store", () => ({
  getIdempotencyRecord: store.get,
  insertIdempotencyRecord: store.insert,
  updateIdempotencyRecord: store.update,
  deleteIdempotencyRecord: store.remove,
  claimExpiredIdempotencyRecord: store.claim
}));
vi.mock("../redis/upstash", () => ({ getRedis: () => { throw new Error("DB-only fixture"); } }));

const secret = "synthetic-idempotency-test-key";
const aad = "clawdeals:idempotency:response:v2";
const cookies = [
  "owner_session=synthetic-session; Path=/; HttpOnly; Secure; SameSite=Lax",
  "legacy_session=; Max-Age=0; Path=/; HttpOnly"
];
const headers = { "SeT-CoOkIe": cookies, "Cache-Control": "no-store", "X-Trace": ["one", "two"] };
const body = { data: { owner_id: "synthetic-owner" } };
const context = { record: { idempotency_id: "synthetic-record" }, lockKey: null };
const request = { headers: { "idempotency-key": "synthetic-key" }, query: {} };
const requestContext = {
  actor: { type: "owner", id: "synthetic-owner" }, method: "POST", path: "/synthetic/auth", body: {}
};
// Legacy SHA records let decryption tests reach the cipher even when a key is
// missing/wrong, rather than being rejected at request-HMAC verification first.
const requestHmac = `sha256:${crypto.createHash("sha256").update("POST\n/synthetic/auth\n\n{}").digest("hex")}`;

async function persist(responseBody: unknown = body, responseHeaders: JsonResponse["headers"] = headers, status = 200) {
  await finalizeIdempotency(context, { status, body: responseBody, headers: responseHeaders });
  expect(store.update).toHaveBeenCalledOnce();
  return store.update.mock.calls[0][1];
}

async function replay(row: Record<string, unknown>): Promise<JsonResponse<any>> {
  store.get.mockResolvedValue({ ...context.record, status: "COMPLETED", request_hmac: requestHmac, ...row });
  const result = await beginIdempotency(request, requestContext, { enabled: true });
  expect(result.action).toBe("replay");
  if (result.action !== "replay") throw new Error("Expected completed replay");
  return result.response;
}

function expectReplayFailure(result: JsonResponse<any>) {
  expect(result.status).toBe(500);
  expect(result.body.error.code).toBe("IDEMPOTENCY_REPLAY_FAILED");
  expect(result.headers).toEqual({ "Idempotency-Replayed": "true" });
  expect(JSON.stringify(result)).not.toContain("synthetic-session");
  expect(store.insert).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("IDEMPOTENCY_SECRET", secret);
  vi.stubEnv("IDEMPOTENCY_RESPONSE_ENVELOPE_V2", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("encrypted response headers", () => {
  it("stores no plaintext body or headers and replays exact header names and arrays", async () => {
    const original = { body, headers };
    const snapshot = JSON.stringify(original);
    const row = await persist();
    expect(row.response_body).toBeNull();
    expect(row.response_headers).toBeNull();
    expect(row.response_body_encrypted).toMatch(/^v2:v1:/);
    expect(JSON.stringify(row)).not.toContain("synthetic-session");
    expect(JSON.stringify(row)).not.toContain("synthetic-owner");
    const result = await replay(row);
    expect(result).toEqual({ type: "json", status: 200, body, headers: { ...headers, "Idempotency-Replayed": "true" } });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("keeps multiple Set-Cookie lines intact through the real HTTP sender", async () => {
    const row = await persist(body, { "Set-Cookie": cookies, "Cache-Control": "no-store" });
    const result = await replay(row);
    const server = http.createServer((_req, res) => sendJson(res, result.status, result.body, result.headers));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing local address");
      const received = await new Promise<{ cookies: string[]; body: string; status: number }>((resolve, reject) => {
        http.get({ host: "127.0.0.1", port: address.port }, (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { text += chunk; });
          res.on("end", () => resolve({ cookies: res.headers["set-cookie"], body: text, status: res.statusCode }));
          res.on("error", reject);
        }).on("error", reject);
      });
      expect(received).toEqual({ cookies, body: JSON.stringify(body), status: 200 });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each(["Set-Cookie", "set-cookie", "Cookie", "AUTHORIZATION", "Proxy-Authorization", "X-API-Key", "Api-Key", "X-Auth-Token"])(
    "protects credential-capable %s response headers", async (name) => {
      const responseHeaders = { [name]: "synthetic-credential", "Retry-After": "3" };
      const row = await persist(body, responseHeaders);
      expect(row.response_headers).toBeNull();
      expect(JSON.stringify(row)).not.toContain("synthetic-credential");
      expect((await replay(row)).headers).toEqual({ ...responseHeaders, "Idempotency-Replayed": "true" });
    }
  );

  it.each([null, false, 0, "", [], { data: { access_token: "synthetic-body-token" } }])(
    "preserves JSON body %j inside the envelope", async (responseBody) => {
      const row = await persist(responseBody);
      expect((await replay(row)).body).toEqual(responseBody);
      expect(JSON.stringify(row)).not.toContain("synthetic-body-token");
    }
  );

  it("preserves FAILED status and HTTP status for stored 5xx responses", async () => {
    const row = await persist({ error: { code: "FIXTURE_FAILURE" } }, headers, 503);
    expect(row.status).toBe("FAILED");
    expect((await replay(row)).status).toBe(503);
  });

  it("does not silently persist cookies when the encryption secret is missing", async () => {
    vi.stubEnv("IDEMPOTENCY_SECRET", "");
    await expect(persist()).rejects.toThrow("IDEMPOTENCY_SECRET");
    expect(store.update).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it.each([400, 429])("retains the existing nonpersisted status %i behavior", async (status) => {
    vi.stubEnv("IDEMPOTENCY_SECRET", "");
    await finalizeIdempotency(context, { status, body, headers });
    expect(store.remove).toHaveBeenCalledWith("synthetic-record");
    expect(store.update).not.toHaveBeenCalled();
  });
});

describe("fail-closed replay", () => {
  it.each(["", "synthetic-wrong-key"])("does not replay with missing/wrong secret %j", async (wrongSecret) => {
    const row = await persist();
    vi.stubEnv("IDEMPOTENCY_SECRET", wrongSecret);
    expectReplayFailure(await replay({ ...row, response_headers: headers, response_body: body }));
  });

  it.each([2, 3, 4])("rejects tampering in cipher component %i", async (component) => {
    const row = await persist();
    const parts = row.response_body_encrypted.split(":");
    const bytes = Buffer.from(parts[component], "base64");
    bytes[0] ^= 1;
    parts[component] = bytes.toString("base64");
    expectReplayFailure(await replay({ ...row, response_body_encrypted: parts.join(":"), response_headers: headers, response_body: body }));
  });

  it.each(["remove-prefix", "unknown-version", "truncated", "short-tag", "malformed-base64"])("rejects %s without plaintext fallback", async (mutation) => {
    const row = await persist();
    let ciphertext = row.response_body_encrypted;
    if (mutation === "remove-prefix") ciphertext = ciphertext.slice(3);
    if (mutation === "unknown-version") ciphertext = ciphertext.replace(/^v2:/, "v3:");
    if (mutation === "truncated") ciphertext = "v2:v1:broken";
    if (mutation === "malformed-base64") ciphertext += "!";
    if (mutation === "short-tag") {
      const parts = ciphertext.split(":");
      parts[4] = Buffer.from(parts[4], "base64").subarray(0, 4).toString("base64");
      ciphertext = parts.join(":");
    }
    expectReplayFailure(await replay({ ...row, response_body_encrypted: ciphertext, response_headers: headers, response_body: body }));
  });

  it("ignores plaintext shadow fields when a valid envelope exists", async () => {
    const row = await persist();
    const result = await replay({ ...row, response_headers: { "Set-Cookie": "wrong-session=synthetic" }, response_body: { wrong: true } });
    expect(result.body).toEqual(body);
    expect(result.headers).toEqual({ ...headers, "Idempotency-Replayed": "true" });
  });

  it.each([
    null,
    { version: 3, body, headers },
    { version: 2, headers },
    { version: 2, body, headers: null },
    { version: 2, body, headers: [] },
    { version: 2, body, headers: { "Set-Cookie": [cookies[0], 123] } }
  ])("rejects authenticated but malformed envelope %j", async (payload) => {
    const encrypted = encryptJson({ secret, payload, additionalAuthenticatedData: aad });
    expectReplayFailure(await replay({ response_status: 200, response_body_encrypted: `v2:${encrypted}`, response_body: body, response_headers: headers }));
  });

  it("does not return plaintext legacy headers on legacy decryption failure", async () => {
    const encrypted = encryptJson({ secret, payload: { token: "synthetic-token" } });
    vi.stubEnv("IDEMPOTENCY_SECRET", "synthetic-wrong-key");
    expectReplayFailure(await replay({ response_status: 200, response_headers: headers, response_body_encrypted: encrypted }));
  });
});

describe("legacy compatibility and reader-first rollout", () => {
  it.each([undefined, "false", "1", "TRUE"])("keeps old writers compatible until explicit activation (%j)", async (flag) => {
    vi.stubEnv("IDEMPOTENCY_RESPONSE_ENVELOPE_V2", flag);
    const row = await persist();
    expect(row.response_headers).toEqual(headers);
    expect(row.response_body).toEqual(body);
    expect(row.response_body_encrypted).toBeNull();
    expect((await replay(row)).headers).toEqual({ ...headers, "Idempotency-Replayed": "true" });
  });

  it("reads v2 when the writer gate is disabled", async () => {
    const row = await persist();
    vi.stubEnv("IDEMPOTENCY_RESPONSE_ENVELOPE_V2", undefined);
    expect((await replay(row)).headers).toEqual({ ...headers, "Idempotency-Replayed": "true" });
  });

  it("keeps safe headers and nonsensitive body plaintext, including without a key", async () => {
    vi.stubEnv("IDEMPOTENCY_SECRET", "");
    const safeHeaders = { "Cache-Control": "no-store", "Retry-After": "2" };
    const row = await persist(body, safeHeaders);
    expect(row).toMatchObject({ response_body: body, response_headers: safeHeaders, response_body_encrypted: null });
    expect((await replay(row)).body).toEqual(body);
  });

  it("retains the v1 body-only format for sensitive bodies and safe headers", async () => {
    const sensitiveBody = { data: { access_token: "synthetic-token" } };
    const safeHeaders = { "Cache-Control": "no-store" };
    const row = await persist(sensitiveBody, safeHeaders);
    expect(row.response_body).toBeNull();
    expect(row.response_headers).toEqual(safeHeaders);
    expect(row.response_body_encrypted).toMatch(/^v1:/);
    expect(decryptJson({ secret, payload: row.response_body_encrypted })).toEqual(sensitiveBody);
    expect((await replay(row)).body).toEqual(sensitiveBody);
  });

  it("replays legacy plaintext rows with original cookie arrays", async () => {
    vi.stubEnv("IDEMPOTENCY_SECRET", "");
    const result = await replay({ response_status: 201, response_body: body, response_headers: headers });
    expect(result).toEqual({ type: "json", status: 201, body, headers: { ...headers, "Idempotency-Replayed": "true" } });
  });

  it("never confuses a legacy body shaped like an envelope with the new format", async () => {
    const legacyBody = { version: 2, body: { token: "synthetic-token" }, headers: { "Set-Cookie": "not-a-replay-header" } };
    const result = await replay({ response_body_encrypted: encryptJson({ secret, payload: legacyBody }), response_headers: headers });
    expect(result.body).toEqual(legacyBody);
    expect(result.headers).toEqual({ ...headers, "Idempotency-Replayed": "true" });
  });

  it("reads a fixed pre-envelope v1 AES-GCM fixture with original plaintext headers", async () => {
    // Produced independently with the legacy v1 algorithm, fixed fixture IV,
    // and the synthetic key above. No current writer is involved in this test.
    const encrypted = "v1:MDEyMzQ1Njc4OWFi:+nriVmDPNWTPLnDkWaxmx4fR7dkK9ARtZv2WkCh8Djh+Zs27cqp+pHHy00Q4MKqpefg=:7YxEizG4k2kLrH5hkPKh6w==";
    const result = await replay({ response_body_encrypted: encrypted, response_headers: headers });
    expect(result.body).toEqual({ data: { access_token: "synthetic-legacy-token" } });
    expect(result.headers).toEqual({ ...headers, "Idempotency-Replayed": "true" });
  });
});
