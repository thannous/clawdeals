import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { isRehearsalMode, assertRehearsalEffectAllowed } from "./rehearsal";
import { getAuthBackend, getDatabaseBackend } from "./backends";
import { getSupabaseServiceClient } from "../db/supabase";
import { isInternalCronAuthorized, isQueueDispatchAuthorized } from "../internal-cron-auth";

const transports = vi.hoisted(() => ({ blob: vi.fn(), supabase: vi.fn(), query: vi.fn(), redis: vi.fn(), auth: vi.fn(), waitUntil: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: transports.blob, del: transports.blob, get: transports.blob, head: transports.blob, issueSignedToken: transports.blob, presignUrl: transports.blob }));
vi.mock("@supabase/supabase-js", () => ({ createClient: transports.supabase }));
vi.mock("../db/neon", () => ({ getNeonSql: () => ({ query: transports.query }), ensureNeonRuntimeRole: transports.query }));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { transports.redis(); } static fromEnv = transports.redis; } }));
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: transports.auth }));
vi.mock("@vercel/functions", () => ({ waitUntil: transports.waitUntil, getDeadline: () => new Date(Date.now() + 60000) }));

beforeEach(() => {
  vi.stubEnv("CLAWDEALS_REHEARSAL_MODE", "true");
  vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "neon");
  vi.stubEnv("CLAWDEALS_AUTH_BACKEND", "neon");
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", "neon");
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE", "true");
  vi.stubEnv("CLAWDEALS_MIGRATION_FREEZE", "false");
  for (const key of ["RESEND_API_KEY", "BLOB_READ_WRITE_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "TELEGRAM_BOT_TOKEN", "CRON_SECRET", "INTERNAL_CRON_SECRET", "QUEUE_DISPATCH_SECRET", "UPSTASH_REDIS_REST_TOKEN"]) vi.stubEnv(key, "fake-credential-for-rehearsal-tests-only");
  vi.stubEnv("SUPABASE_URL", "https://fake.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.invalid");
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("OWNER_LOGIN_EMAIL_PROVIDER", "resend");
  vi.stubEnv("EMAIL_FROM", "fixture@example.invalid");
  vi.stubEnv("CLAWDEALS_QUEUE_WAKE_ORIGIN", "https://fake.vercel.app");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Transport must not run"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  for (const mock of Object.values(transports)) expect(mock).not.toHaveBeenCalled();
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe("server rehearsal boundary, including inherited credentials", () => {
  it("is default-off, explicit, non-expiring and fail-closed for misspellings", () => {
    for (const value of [undefined, "", "false", "0", " FALSE "]) expect(isRehearsalMode({ CLAWDEALS_REHEARSAL_MODE: value })).toBe(false);
    for (const value of ["true", "1", "treu", "off", "2026-01-01"]) expect(isRehearsalMode({ CLAWDEALS_REHEARSAL_MODE: value })).toBe(true);
    vi.stubEnv("CLAWDEALS_REHEARSAL_MODE", "false");
    expect(() => assertRehearsalEffectAllowed("normal behavior")).not.toThrow();
  });
  it("never falls back to Supabase or exposes its auth/storage clients", () => {
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "");
    expect(getDatabaseBackend).toThrow(/Neon/);
    expect(getSupabaseServiceClient).toThrow(/Neon/);
    vi.stubEnv("CLAWDEALS_AUTH_BACKEND", "supabase");
    expect(getAuthBackend).toThrow(/Neon/);
    vi.stubEnv("CLAWDEALS_DATABASE_BACKEND", "neon");
    const client = getSupabaseServiceClient();
    expect(() => client.auth).toThrow(/Rehearsal/);
    expect(() => client.storage).toThrow(/Rehearsal/);
  });
  it("refuses valid cron and database wake credentials", () => {
    const req = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "x-cron-secret": process.env.INTERNAL_CRON_SECRET } };
    expect(isInternalCronAuthorized(req)).toBe(false);
    expect(isQueueDispatchAuthorized(req)).toBe(false);
  });
  it("blocks direct queue consumers, leases, and postcommit wakes before claiming imported state", async () => {
    const client = { rpc: vi.fn(), from: vi.fn() }; const work = vi.fn();
    const { withQueueDrainLease } = await import("../services/queue-drain");
    await expect(withQueueDrainLease("notifications-dispatch", work, client)).rejects.toMatchObject({ code: "REHEARSAL_EFFECT_BLOCKED" });
    for (const [path, name] of [
      ["../services/neon-queue-wake", "wakeNeonQueuesAfterCommit"],
      ["../services/watchlist-match-queue", "runWatchlistMatchQueue"],
      ["../services/watchlist-backfill-queue", "runWatchlistBackfillQueue"],
      ["../services/notifications-dispatch", "runNotificationsDispatch"],
      ["../trustscore/recalc-queue", "runTrustScoreRecalcQueue"]
    ]) {
      const mod = await import(path);
      await expect(mod[name]({ client })).rejects.toMatchObject({ code: "REHEARSAL_EFFECT_BLOCKED" });
    }
    expect(client.rpc).not.toHaveBeenCalled(); expect(client.from).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled();
  });
  it("blocks real email, Telegram, storage writes and upload capabilities on direct calls", async () => {
    const calls = [
      () => import("../channels/email/client").then(m => m.sendEmailMessage({ toEmail: "fixture@example.invalid", subject: "fixture", text: "fixture" })),
      () => import("../channels/telegram/client").then(m => m.sendTelegramMessage({ chatId: "fixture", text: "fixture" })),
      () => import("../services/owner-login-email").then(m => m.sendOwnerLoginMagicLinkEmail({ email: "fixture@example.invalid", sessionId: "fixture", token: "fixture" })),
      () => import("../storage/vercel-blob").then(m => m.putPublicListingPhoto({ key: "fixture", bytes: Buffer.from("x"), contentType: "image/png" })),
      () => import("../storage/vercel-blob").then(m => m.deleteVercelBlob("fixture")),
      () => import("../storage/evidence-storage").then(m => m.createEvidenceUploadUrl({ bucket: "vercel-blob-private", key: "fixture", expiresInSeconds: 60, policy: { allowedContentTypes: ["image/png"], maximumSizeInBytes: 100 } })),
      () => import("../storage/evidence-storage").then(m => m.putPrivateEvidenceObject("vercel-blob-private", "fixture", Buffer.from("x"), "image/png")),
      () => import("../storage/evidence-storage").then(m => m.deleteEvidenceObject("vercel-blob-private", "fixture")),
      () => import("../services/listing-media-storage").then(m => m.uploadListingPhoto({} as any)),
      () => import("../services/listing-media-storage").then(m => m.deleteListingPhoto({} as any))
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "REHEARSAL_EFFECT_BLOCKED" });
  });
  it("blocks authentication mutation clients, inherited Redis, PSP and retention REST", async () => {
    for (const [path, name, args] of [
      ["../auth/neon-auth", "getNeonAuth", []],
      ["../redis/upstash", "getRedis", []],
      ["../rate-limit/upstash", "createUpstashRedis", [{ url: "https://fake.invalid", token: "fake" }]],
      ["../psp", "createPspAdapter", [{ provider: "mock", mode: "test" }]],
      ["../retention/shared", "restRequest", [{ method: "DELETE" }]],
      ["../retention/partition-manager", "ensureFuturePartitions", []],
      ["../services/local-chatgpt", "localChatGPT", ["fixture", "fixture"]]
    ] as const) {
      const mod = await import(path);
      await expect(Promise.resolve().then(() => mod[name](...args))).rejects.toMatchObject({ code: "REHEARSAL_EFFECT_BLOCKED" });
    }
  });
  it("refuses every internal cron route even with valid credentials", async () => {
    const routes = import.meta.glob("../../pages/api/internal/cron/*.ts");
    expect(Object.keys(routes).length).toBeGreaterThan(10);
    for (const load of Object.values(routes)) {
      const { default: handler } = await load() as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
      await handler({ method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });
  it("requires the safe compiled auth configuration before serving UI, preserves freeze", async () => {
    const request = new NextRequest("https://example.invalid/browse");
    expect(proxy(request).status).toBe(200);
    for (const key of ["NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", "NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE", "CLAWDEALS_DATABASE_BACKEND", "CLAWDEALS_AUTH_BACKEND"]) {
      const previous = process.env[key];
      vi.stubEnv(key, "");
      expect(proxy(request).status).toBe(503);
      vi.stubEnv(key, previous);
    }
    vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", "supabase");
    expect(proxy(request).status).toBe(503);
    vi.stubEnv("CLAWDEALS_MIGRATION_FREEZE", "true");
    expect(await proxy(request).json()).toMatchObject({ error: { code: "MIGRATION_MAINTENANCE" } });
  });
  it("blocks mutation routes and OAuth GET callbacks in proxy", () => {
    expect(proxy(new NextRequest("https://example.invalid/api/auth/callback/google")).status).toBe(503);
    expect(proxy(new NextRequest("https://example.invalid/api/v1/listings", { method: "POST" })).status).toBe(503);
  });
});
