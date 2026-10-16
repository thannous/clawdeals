import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@e2e-dev/web", () => ({ test: { extend: (fixtures: unknown) => fixtures } }));
const redis = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn().mockResolvedValue(0), exists: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/server/redis/upstash", () => ({ getRedis: () => redis }));
import { test as definitions, type CommerceFixture } from "../../../e2e/testerarmy/commerce-live/fixtures";
import { parseApiKey } from "../../../src/server/utils/api-keys";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "commerce-production-fixture-"));
  for (const [key, value] of Object.entries({
    TESTERARMY_COMMERCE_LIVE: "1", TESTERARMY_COMMERCE_PRODUCTION: "1", VERCEL: "",
    CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS: "gztfmpuqtpvncdcuhqxy",
    SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", TESTERARMY_COMMERCE_PASSWORD: "synthetic-password",
    UPSTASH_REDIS_REST_URL: "https://synthetic.upstash.io", UPSTASH_REDIS_REST_TOKEN: "synthetic-redis-token",
    TESTERARMY_REDIS_FIXTURE: "production-real", PARITY_OUTPUT: directory
  })) vi.stubEnv(key, value);
  redis.get.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

function transport(options: { cap?: boolean; wrongRedis?: boolean } = {}) {
  const publications: unknown[] = [];
  const agents = new Map<string, { owner_id: string }>();
  const prefixes = new Map<string, string>();
  const cached = new Map<string, unknown>();
  const methods: string[] = [];
  redis.get.mockImplementation(async key => cached.get(key));
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    if (["/fr/auth/login", "/fr/webmcp-challenge"].includes(url.pathname)) {
      return new Response(`<script id="__NEXT_DATA__">${JSON.stringify({ buildId: "release", props: { pageProps: { deploySha: "a".repeat(40) } } })}</script>`);
    }
    if (url.pathname === "/api/v1/agents/me") {
      const header = new Headers(init?.headers).get("authorization")!;
      const prefix = parseApiKey(header.replace(/^Bearer /, ""))!.prefix;
      const agentId = prefixes.get(prefix)!;
      const ownerId = agents.get(agentId)!.owner_id;
      if (!options.wrongRedis) cached.set(`auth:api_key_prefix:${prefix}`, { agent_id: agentId, owner_id: ownerId });
      return Response.json({ data: { agent_id: agentId, owner_id: ownerId } });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users")) {
      if (method === "POST") return Response.json({ id: randomUUID(), email: "synthetic@example.test" });
      if (method === "GET") return Response.json({ code: "user_not_found" }, { status: 404 });
      return Response.json({ id: url.pathname.split("/").pop() });
    }
    const table = url.pathname.split("/").pop()!;
    if (method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
    if (table === "watchlists" && method === "GET" && url.searchParams.get("active") === "eq.true") {
      methods.push(method);
      if (!options.cap) return Response.json([], { headers: { "content-range": "*/0" } });
      const after = url.searchParams.has("watchlist_id");
      const row = { watchlist_id: `00000000-0000-4000-8000-00000000000${after ? "2" : "1"}`, agent_id: randomUUID(), active: true, deleted_at: null,
        market_code: "FR", currency: "EUR", query_text: after ? null : "does-not-match", tags: [], price_max: 200, geo_lat: null, geo_lon: null, distance_km: null, criteria: null };
      return Response.json([row], { headers: { "content-range": `0-0/${after ? 1 : 2}` } });
    }
    if (method === "GET") return Response.json([]);
    if (method === "POST") {
      const row = JSON.parse(String(init?.body));
      if (table === "agents") agents.set(row.id, row);
      if (table === "api_keys") prefixes.set(row.key_prefix, row.agent_id);
      if (table === "listings") publications.push(row);
    }
    if (["POST", "DELETE"].includes(method)) return new Response(null, { status: 204 });
    throw new Error(`Unexpected fixture HTTP request ${method} ${table}`);
  }));
  return { publications, methods };
}

async function run() {
  const fixture = definitions as unknown as { commerceFixture: (context: any, provide: (fixture: CommerceFixture) => Promise<void>) => Promise<void> };
  await fixture.commerceFixture({ app: { baseUrl: "https://app.clawdeals.com" }, browser: { route: async () => {} } }, async () => {});
}

describe("production commerce fixture safety before publication", () => {
  it("refuses a third-party match behind a backend row cap instead of publishing early", async () => {
    const { publications, methods } = transport({ cap: true });
    await expect(run()).rejects.toThrow("matching watchlist outside the fixture");
    expect(publications).toHaveLength(0);
    expect(methods).toEqual(["GET", "GET"]);
  });
  it("refuses publication when the chosen Redis did not receive the hosted app's fresh authentication cache", async () => {
    const { publications } = transport({ wrongRedis: true });
    await expect(run()).rejects.toThrow("Production Redis identity could not be verified");
    expect(publications).toHaveLength(0);
  });
  it("records both runtime Redis proofs and stable deployment without exporting credentials", async () => {
    const { publications } = transport();
    await run();
    expect(publications).toHaveLength(1);
    const file = readdirSync(join(directory, "commerce-fixtures"))[0];
    const raw = readFileSync(join(directory, "commerce-fixtures", file), "utf8");
    const receipt = JSON.parse(raw);
    expect(receipt).toMatchObject({ production: true, redisRuntimeVerified: ["buyer", "seller"], cleanupErrors: [], notificationPreflight: { complete: true } });
    expect(receipt.deployment.before.deploySha).toBe(receipt.deployment.after.deploySha);
    for (const value of ["synthetic-service-key", "synthetic-password", "synthetic-redis-token", "key_hash", "auth:api_key_prefix:"]) expect(raw).not.toContain(value);
  });
});
