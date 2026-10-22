import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { test as base } from "@e2e-dev/web";

const definitions = {
  budget: { price: 200, battery: 80, issues: 2 },
  battery: { price: 350, battery: 97, issues: 1 },
  condition: { price: 300, battery: 90, issues: 0 },
  fourth: { price: 425, battery: 85, issues: 0 },
  tie: { price: 200, battery: 80, issues: 2 },
  unknown: { price: 150, battery: null, issues: null },
  without: { price: 175, battery: null, issues: null },
  foreign: { price: 100, battery: 99, issues: 0 },
  private: { price: 50, battery: 100, issues: 0 },
  hidden: { price: 60, battery: 100, issues: 0 },
  unsupported: { price: 75, battery: null, issues: null },
} as const;
export type ComparisonKey = keyof typeof definitions;
type Entry = { id: string; title: string; model: string; price: number; battery: number | null; issues: number | null };
export type ComparisonFixture = {
  query: string;
  browserReads: string[];
  entries: Record<ComparisonKey, Entry>;
  comparePath: (...keys: ComparisonKey[]) => string;
  read: (...keys: ComparisonKey[]) => Promise<{ status: number; body: any }>;
  removeListing: (key: ComparisonKey) => Promise<void>;
};
const keys = Object.keys(definitions) as ComparisonKey[];
const checks = ["battery", "screen", "functionality", "locks", "repairs_accessories"] as const;
const loopbacks = new Set(["localhost", "127.0.0.1", "[::1]"]);
function localOrigin(raw: string | undefined, label: string) {
  if (!raw) throw new Error(`${label} is required.`);
  const url = new URL(raw);
  if (url.protocol !== "http:" || !loopbacks.has(url.hostname) || url.username || url.password || url.pathname !== "/") {
    throw new Error(`${label} must be an explicit local HTTP origin. Production is never authorized by this fixture.`);
  }
  return url.origin;
}
function checked(error: { code?: string } | null, operation: string) {
  if (error) throw new Error(`${operation} failed (${error.code || "database error"}).`);
}

// Real app API + native local Supabase/Postgres. No API/Next-data interception.
// These synthetic rows are owned by one generated owner and deleted in finally.
export const test = base.extend<{ comparison: ComparisonFixture }>({
  comparison: async ({ app, browser }, provide) => {
    if (process.env.TESTERARMY_COMPARISON_LIVE !== "1") throw new Error("The local comparison opt-in is required.");
    const backend = localOrigin(process.env.SUPABASE_URL, "SUPABASE_URL");
    if (localOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL") !== backend) throw new Error("Public and server Supabase targets must match.");
    const origin = localOrigin(app.baseUrl, "E2E_BASE_URL");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new Error("The local service key is required.");
    const db = createClient(backend, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const fixtureId = randomUUID();
    const ownerId = randomUUID();
    const agentId = randomUUID();
    const query = `cmp${fixtureId.replaceAll("-", "")}`;
    const entries = Object.fromEntries(keys.map(key => [key, {
      id: randomUUID(), title: `${query} ${key === "unsupported" ? "Vélo" : "iPhone"} ${key}`,
      model: `Smartphone ${key}`, ...definitions[key],
    }])) as Record<ComparisonKey, Entry>;
    const ids = keys.map(key => entries[key].id);
    const browserReads: string[] = [];
    const apiReads: { ids: string[]; status: number }[] = [];
    const cleanupErrors: string[] = [];
    const remaining: Record<string, number | null> = {};
    let primary: unknown;
    let failed = false;
    await browser.route("**/*", route => {
      const url = new URL(route.request.url);
      if (url.origin === origin && ["GET", "HEAD"].includes(route.request.method)) {
        if (url.pathname === "/api/v1/public/smartphone-comparison") browserReads.push(url.searchParams.get("ids") || "");
        return route.continue();
      }
      return route.abort();
    });
    // Clipboard seam only: avoids changing the developer's system clipboard.
    await browser.addInitScript(`Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async (value) => { window.__comparisonCopiedText = value; } } });`);
    try {
      checked((await db.from("owners").insert({ owner_id: ownerId, email: `${query}@example.test` })).error, "Seed comparison owner");
      checked((await db.from("agents").insert({ id: agentId, owner_id: ownerId, name: query, trust_score: 80, trust_flags: [] })).error, "Seed comparison agent");
      checked((await db.from("listings").insert(keys.map(key => ({
        listing_id: entries[key].id, owner_id: ownerId, agent_id: agentId, seller_agent_id: agentId,
        title: entries[key].title, description: query, status: key === "private" ? "DRAFT" : "LIVE",
        category: key === "unsupported" ? "bicycles" : "smartphones", condition: "GOOD",
        price_amount: entries[key].price, currency: key === "foreign" ? "GBP" : "EUR", market_code: key === "foreign" ? "GB" : "FR",
        geo_lat: 48.85, geo_lng: 2.35, photos: [], delivery_method: "PICKUP",
      })))).error, "Seed comparison listings");
      checked((await db.from("moderation_states").insert({ entity_type: "listing", entity_id: entries.hidden.id, hidden: true })).error, "Seed own hidden comparison listing");
      for (const key of keys.filter(key => key !== "unsupported" && key !== "without")) {
        const entry = entries[key];
        const values = Object.fromEntries(checks.map((id, index) => {
          const issue = entry.issues !== null && index > 0 && index <= entry.issues;
          return [id, { answer: entry.issues === null ? "unknown" : issue ? "issue" : "ok", notes: issue ? `Défaut déclaré ${id}` : "", photo_ids: [] }];
        }));
        checked((await db.rpc("save_smartphone_passport_v1", {
          p_listing_id: entry.id, p_owner_id: ownerId, p_expected_revision: 0,
          p_model: entry.model, p_battery_health_percent: entry.battery, p_checks: values,
        })).error, "Seed validated comparison passport");
      }
      await provide({
        query, entries, browserReads,
        comparePath: (...selected) => `/fr/browse/compare?ids=${selected.map(key => entries[key].id).join(",")}`,
        read: async (...selected) => {
          const selectedIds = selected.map(key => entries[key].id);
          const response = await fetch(`${origin}/api/v1/public/smartphone-comparison?ids=${selectedIds.join(",")}`, { signal: AbortSignal.timeout(15_000), redirect: "error" });
          const body = await response.json();
          apiReads.push({ ids: selectedIds, status: response.status });
          return { status: response.status, body };
        },
        removeListing: async key => checked((await db.from("listings").delete().eq("listing_id", entries[key].id).eq("owner_id", ownerId)).error, "Remove own comparison listing"),
      });
    } catch (error) { failed = true; primary = error; }
    finally {
      async function remove(label: string, operation: PromiseLike<{ error: { code?: string } | null }>) {
        try { checked((await operation).error, label); } catch { cleanupErrors.push(label); }
      }
      await remove("comparison queue", db.from("watchlist_match_queue").delete().eq("entity_type", "listing").in("entity_id", ids));
      await remove("comparison hidden state", db.from("moderation_states").delete().eq("entity_type", "listing").in("entity_id", ids));
      await remove("comparison listings", db.from("listings").delete().in("listing_id", ids).eq("owner_id", ownerId));
      await remove("comparison agent", db.from("agents").delete().eq("id", agentId).eq("owner_id", ownerId));
      await remove("comparison owner", db.from("owners").delete().eq("owner_id", ownerId));
      for (const [table, column, values] of [
        ["smartphone_passports", "listing_id", ids], ["listings", "listing_id", ids],
        ["watchlist_match_queue", "entity_id", ids], ["moderation_states", "entity_id", ids], ["agents", "id", [agentId]], ["owners", "owner_id", [ownerId]],
      ] as [string, string, string[]][]) {
        try {
          const result = await db.from(table).select(column, { head: true, count: "exact" }).in(column, values);
          remaining[table] = result.count;
          if (result.error || result.count !== 0) cleanupErrors.push(`Residual ${table}`);
        } catch { remaining[table] = null; cleanupErrors.push(`Residual ${table}`); }
      }
      const directory = join(process.env.PARITY_OUTPUT || ".e2e", "comparison-fixtures");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${fixtureId}.json`), JSON.stringify({
        fixtureId, appOrigin: origin, backendOrigin: backend, ownerId, agentId, listingIds: ids,
        realServices: ["local app API", "native local Supabase REST", "Postgres with production migrations"],
        apiReads, browserReads, cleanupErrors, remaining, fixtureFailed: failed, credentialsRecorded: false,
        clipboard: "intercepted only to preserve the host clipboard", apiInterception: false,
      }, null, 2) + "\n", { flag: "wx" });
    }
    if (failed) throw primary;
    if (cleanupErrors.length) throw new Error(`Comparison cleanup failed: ${cleanupErrors.join(", ")}`);
  },
});
