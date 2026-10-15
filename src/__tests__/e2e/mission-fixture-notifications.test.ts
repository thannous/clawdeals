import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real fixture and Supabase HTTP builder without registering a
// browser test or contacting a backend. The fixture's publication must be gated.
vi.mock("@e2e-dev/web", () => ({ test: { extend: (fixtures: unknown) => fixtures } }));
import { test as fixtureDefinitions } from "../../../e2e/testerarmy/mission-live/fixtures";

const AGENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
let directory: string;
const watchlist = (index: number, overrides: Record<string, unknown> = {}) => ({
  watchlist_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  agent_id: "33333333-3333-4333-8333-333333333333", active: true, deleted_at: null,
  market_code: "GB", currency: "GBP", query_text: "bicycle", tags: [], price_max: 100,
  geo_lat: 51.5074, geo_lon: -0.1278, distance_km: 10, criteria: {}, ...overrides
});

function transport(rows: ReturnType<typeof watchlist>[], mode = "ok") {
  const publications: Record<string, unknown>[] = [];
  const watchlistMethods: string[] = [];
  const requests: { method: string; table: string; query: URLSearchParams }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    if (url.pathname.startsWith("/auth/v1/admin/users")) return Response.json({ id: USER, email: "synthetic@example.test" });
    const table = url.pathname.split("/").pop()!;
    requests.push({ method, table, query: url.searchParams });
    if (method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
    if (table === "watchlists") {
      watchlistMethods.push(method);
      if (method !== "GET") throw new Error("A fixture must never mutate existing watchlists.");
      if (mode === "unavailable") return Response.json({ code: "42501", message: "private criteria must not be exported" }, { status: 403 });
      if (mode === "malformed") return Response.json(null);
      let selected = rows.filter(row => row.active && row.deleted_at === null && row.market_code === "GB");
      const cursor = url.searchParams.get("watchlist_id")?.replace(/^gt\./, "");
      if (cursor && mode !== "stalled") selected = selected.filter(row => row.watchlist_id > cursor);
      const page = selected.slice(0, mode === "capped" ? 1 : Number(url.searchParams.get("limit") || selected.length));
      return Response.json(page, { headers: mode === "missing-count" ? {} : { "content-range": `0-${page.length - 1}/${selected.length}` } });
    }
    if (method === "POST" && table === "listings") publications.push(JSON.parse(String(init?.body)));
    if (method === "POST" && table === "agents") return Response.json({ id: AGENT });
    if (method === "GET" && table === "owner_auth_links") return Response.json([]);
    if (["POST", "DELETE"].includes(method)) return new Response(null, { status: 204 });
    throw new Error(`Unexpected fixture request: ${method} ${table}`);
  }));
  return { publications, watchlistMethods, requests };
}

async function runFixture() {
  const definitions = fixtureDefinitions as unknown as { missionFixture: (context: any, provide: (fixture: any) => Promise<void>) => Promise<void> };
  await definitions.missionFixture({ app: { baseUrl: "http://localhost:4327" }, browser: { route: async () => {} } }, async fixture => {
    await fixture.createListing("GB", 75);
  });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "clawdeals-fixture-notifications-"));
  vi.stubEnv("TESTERARMY_MISSION_LIVE", "1");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubEnv("TESTERARMY_MISSION_PASSWORD", "synthetic-local-password");
  vi.stubEnv("PARITY_OUTPUT", directory);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

describe("live mission fixture notification isolation", () => {
  it.each([{}, null, { notification_mode: "in_app" }])("refuses a matching third-party watchlist before LIVE publication (criteria %j)", async criteria => {
    const { publications, watchlistMethods } = transport([watchlist(1, { criteria })]);
    await expect(runFixture()).rejects.toThrow("Notification preflight");
    expect(publications).toEqual([]);
    expect(watchlistMethods).toEqual(["GET"]);
  });

  it("checks later pages instead of publishing after the first nonmatching page", async () => {
    const rows = Array.from({ length: 500 }, (_, index) => watchlist(index, { query_text: "unrelated" }));
    const { publications, watchlistMethods } = transport([...rows, watchlist(501)]);
    await expect(runFixture()).rejects.toThrow("Notification preflight");
    expect(publications).toEqual([]);
    expect(watchlistMethods).toEqual(["GET", "GET"]);
  });

  it.each(["unavailable", "malformed", "missing-count", "stalled"])("fails closed on %s watchlist evidence", async mode => {
    const rows = Array.from({ length: 501 }, (_, index) => watchlist(index, { query_text: "unrelated" }));
    const { publications } = transport(rows, mode);
    const result = runFixture();
    await expect(result).rejects.toThrow("Notification preflight");
    await expect(result).rejects.not.toThrow("private criteria");
    expect(publications).toEqual([]);
  });

  it("does not mistake a lower backend row cap for a complete scan", async () => {
    const { publications, watchlistMethods } = transport([watchlist(1, { query_text: "unrelated" }), watchlist(2)], "capped");
    await expect(runFixture()).rejects.toThrow("Notification preflight");
    expect(publications).toEqual([]);
    expect(watchlistMethods).toEqual(["GET", "GET"]);
  });

  it("publishes an isolated listing and cleans only its exact queue entry", async () => {
    const { publications, requests } = transport([
      watchlist(1, { price_max: 70, criteria: null }), watchlist(2, { distance_km: 1, geo_lat: 40 }),
      watchlist(3, { query_text: "unrelated" }), watchlist(4, { active: false }),
      watchlist(5, { market_code: "FR" }), watchlist(6, { agent_id: AGENT })
    ]);
    await runFixture();
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({ status: "LIVE", market_code: "GB", price_amount: 75 });
    const removal = requests.find(request => request.table === "watchlist_match_queue" && request.method === "DELETE");
    expect(removal?.query.get("entity_type")).toBe("eq.listing");
    expect(removal?.query.get("entity_id")).toBe(`in.(${publications[0].listing_id})`);
  });
});
