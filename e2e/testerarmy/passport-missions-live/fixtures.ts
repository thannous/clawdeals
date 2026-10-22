import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base } from "@e2e-dev/web";
import { generateApiKey, hashApiKeySecret } from "../../../src/server/utils/api-keys";
import { getRedis } from "../../../src/server/redis/upstash";

const checks = ["battery", "screen", "functionality", "locks", "repairs_accessories"] as const;
const definitions = {
  compatible: { price: 300, health: 92, model: "iPhone 13", screen: "ok" },
  peer: { price: 320, health: 96, model: "iPhone 13", screen: "ok" },
  lowBattery: { price: 280, health: 75, model: "iPhone 13", screen: "ok" },
  expensive: { price: 450, health: 95, model: "iPhone 13", screen: "ok" },
  unknown: { price: 200, health: null, model: "iPhone 13", screen: "unknown" },
  defective: { price: 220, health: 95, model: "iPhone 13", screen: "issue" },
  otherModel: { price: 240, health: 95, model: "iPhone 13 mini", screen: "ok" },
  without: { price: 230, health: null, model: "iPhone 13", screen: "unknown" },
  hidden: { price: 250, health: 95, model: "iPhone 13", screen: "ok" },
} as const;
export type PhoneKey = keyof typeof definitions;
type Role = "buyer" | "seller" | "other";
type Entry = { id: string; title: string; model: string; price: number; health: number | null; screen: string };
type Response = { status: number; body: any };
export type PassportMissionFixture = {
  id: string; query: string; email: string; db: SupabaseClient;
  owners: Record<Role, string>;
  entries: Record<PhoneKey, Entry>;
  missionWrites: { idempotencyKey: string; expectedOwnerId: string; body: string }[];
  api: (role: Role | "anonymous", method: string, path: string, body?: unknown) => Promise<Response>;
  drain: (queue: "watchlist-backfill-queue" | "watchlist-match-queue") => Promise<Response>;
  savePassport: (key: PhoneKey, health: number, note?: string) => Promise<Response>;
  changePrice: (key: PhoneKey, amount: number) => Promise<Response>;
  setMissionState: (id: string, state: "ACTIVE" | "PAUSED" | "EXPIRED") => Promise<void>;
  hideListing: (key: PhoneKey) => Promise<void>;
  missionRow: (id: string) => Promise<any>;
  alertRows: (id: string) => Promise<any[]>;
  externalDeliveries: () => Promise<number>;
};
function localOrigin(raw: string | undefined, label: string) {
  if (!raw) throw new Error(`${label} is required.`);
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/") {
    throw new Error(`${label} must be an explicit loopback HTTP origin; this fixture never permits production.`);
  }
  return url.origin;
}
function checked(error: { code?: string; status?: number } | null, label: string) {
  if (error) throw new Error(`${label} failed (${error.code || error.status || "backend error"}).`);
}

// Connected local Auth + app API + native Postgres. No app/API response mocks.
// Passwords, bearer tokens and session cookies remain in memory; traces are off.
export const test = base.extend<{ passportMission: PassportMissionFixture }>({
  passportMission: async ({ app, browser }, provide) => {
    if (process.env.TESTERARMY_PASSPORT_MISSIONS_LIVE !== "1") throw new Error("Passport missions local opt-in is required.");
    const backend = localOrigin(process.env.SUPABASE_URL, "SUPABASE_URL");
    if (localOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL") !== backend) throw new Error("Public/server local backend mismatch.");
    const origin = localOrigin(app.baseUrl, "E2E_BASE_URL");
    const redisOrigin = localOrigin(process.env.UPSTASH_REDIS_REST_URL, "UPSTASH_REDIS_REST_URL");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const password = process.env.TESTERARMY_MISSION_PASSWORD;
    const cron = process.env.QUEUE_DISPATCH_SECRET || process.env.CRON_SECRET || process.env.INTERNAL_CRON_SECRET;
    if (!key || !anon || !password || !cron) throw new Error("Local service, Auth, opaque runner password and queue credentials are required.");
    const db = createClient(backend, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = randomUUID();
    const query = `pm${id.replaceAll("-", "")}`;
    const roles: Role[] = ["buyer", "seller", "other"];
    const owners = {} as Record<Role, string>;
    const userIds: string[] = [];
    const cookies = {} as Record<Role, string>;
    const sellerAgentId = randomUUID();
    const sellerKey = generateApiKey();
    const entries = Object.fromEntries(Object.entries(definitions).map(([name, value]) => [name, {
      ...value, id: randomUUID(), title: `${query} iPhone 13 ${name}`,
    }])) as Record<PhoneKey, Entry>;
    const listingIds = Object.values(entries).map(entry => entry.id);
    const missionIds = new Set<string>();
    const requests: { role: string; method: string; path: string; status: number }[] = [];
    const refused: { method: string; origin: string; path: string }[] = [];
    const missionWrites: PassportMissionFixture["missionWrites"] = [];
    const cleanupErrors: string[] = [];
    const remaining: Record<string, number | null> = {};
    let primary: unknown;
    let failed = false;
    await browser.route("**/*", async route => {
      const url = new URL(route.request.url);
      const method = route.request.method;
      const appRead = url.origin === origin && ["GET", "HEAD"].includes(method);
      const appWrite = url.origin === origin && method === "POST" && ["/api/v1/auth/session:bridge", "/api/v1/owner/missions"].includes(url.pathname);
      const login = url.origin === backend && method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password";
      if (appWrite && url.pathname === "/api/v1/owner/missions") missionWrites.push({
        idempotencyKey: route.request.headers["idempotency-key"], expectedOwnerId: route.request.headers["x-expected-owner-id"], body: route.request.postData || "",
      });
      if (appRead || appWrite || login) return route.continue();
      refused.push({ method, origin: url.origin, path: url.pathname });
      return route.abort();
    });
    async function api(role: Role | "anonymous", method: string, path: string, body?: unknown): Promise<Response> {
      if (!path.startsWith("/api/v1/owner/missions") && !listingIds.some(listingId => path === `/api/v1/listings/${listingId}` || path === `/api/v1/owner/listings/${listingId}/passport`)) throw new Error("Fixture request outside owned mission/listing routes.");
      const sellerPriceWrite = role === "seller" && method === "PATCH" && listingIds.some(listingId => path === `/api/v1/listings/${listingId}`);
      const response = await fetch(new URL(path, origin), {
        method, redirect: "error", signal: AbortSignal.timeout(20_000), headers: {
          Origin: origin, "Content-Type": "application/json", "User-Agent": "ClawDeals-local-mission-QA",
          ...(sellerPriceWrite ? { Authorization: `Bearer ${sellerKey.apiKey}` } : role === "anonymous" ? {} : { Cookie: cookies[role], "X-Expected-Owner-Id": owners[role] }),
          ...(["POST", "PATCH", "PUT", "DELETE"].includes(method) ? { "Idempotency-Key": randomUUID() } : {}),
        }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const parsed = await response.json();
      requests.push({ role, method, path, status: response.status });
      if (method === "POST" && path === "/api/v1/owner/missions" && parsed.watchlist_id) missionIds.add(parsed.watchlist_id);
      return { status: response.status, body: parsed };
    }
    async function missionRow(missionId: string) {
      const row = await db.from("watchlists").select("watchlist_id,agent_id,criteria,active,agents!inner(owner_id)").eq("watchlist_id", missionId).single();
      checked(row.error, "Read own fixture mission");
      if ((row.data?.agents as unknown as { owner_id: string })?.owner_id !== owners.buyer) throw new Error("Mission does not belong to fixture buyer.");
      missionIds.add(missionId);
      return row.data;
    }
    try {
      for (const role of roles) {
        const email = `${role}-${id}@example.test`;
        const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
        checked(created.error, "Create synthetic local Auth user");
        if (!created.data.user) throw new Error("Local Auth did not create a user.");
        userIds.push(created.data.user.id);
        const loginClient = createClient(backend, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const login = await loginClient.auth.signInWithPassword({ email, password });
        checked(login.error, "Authenticate synthetic local account");
        if (!login.data.session) throw new Error("Local Auth did not issue a session.");
        const bridge = await fetch(`${origin}/api/v1/auth/session:bridge`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
          headers: { Authorization: `Bearer ${login.data.session.access_token}`, Origin: origin, "Content-Type": "application/json", "User-Agent": "ClawDeals-local-mission-QA" }, body: "{}",
        });
        if (bridge.status !== 200) throw new Error(`Real local owner bridge failed (${bridge.status}).`);
        const response = await bridge.json();
        owners[role] = response.data.owner_id;
        cookies[role] = bridge.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
        if (!owners[role] || !cookies[role]) throw new Error("Local bridge did not issue an owner session.");
      }
      checked((await db.from("agents").insert({ id: sellerAgentId, owner_id: owners.seller, name: query, trust_score: 80, trust_flags: [] })).error, "Seed synthetic seller agent");
      checked((await db.from("api_keys").insert({ agent_id: sellerAgentId, key_prefix: sellerKey.prefix, key_hash: await hashApiKeySecret(sellerKey.secret), key_state: "ACTIVE", scope: "full" })).error, "Seed local seller agent key");
      checked((await db.from("listings").insert(Object.values(entries).map(entry => ({
        listing_id: entry.id, owner_id: owners.seller, agent_id: sellerAgentId, seller_agent_id: sellerAgentId,
        title: entry.title, description: query, category: "smartphones", condition: "GOOD", status: "LIVE",
        price_amount: entry.price, currency: "EUR", market_code: "FR", geo_lat: 48.8566, geo_lng: 2.3522, photos: [], delivery_method: "PICKUP",
      })))).error, "Seed local phone listings");
      checked((await db.from("moderation_states").insert({ entity_type: "listing", entity_id: entries.hidden.id, hidden: true })).error, "Seed owned hidden phone");
      for (const [name, entry] of Object.entries(entries)) {
        if (name === "without") continue;
        checked((await db.rpc("save_smartphone_passport_v1", {
          p_listing_id: entry.id, p_owner_id: owners.seller, p_expected_revision: 0, p_model: entry.model,
          p_battery_health_percent: entry.health,
          p_checks: Object.fromEntries(checks.map(checkId => [checkId, {
            answer: checkId === "screen" ? entry.screen : checkId === "battery" && entry.health === null ? "unknown" : "ok",
            notes: checkId === "screen" && entry.screen === "issue" ? "Écran fissuré" : "", photo_ids: [],
          }])),
        })).error, "Seed validated local passport");
      }
      await provide({ id, query, email: `buyer-${id}@example.test`, db, owners, entries, missionWrites, api, missionRow,
        drain: async queue => {
          const response = await fetch(`${origin}/api/internal/cron/${queue}?limit=100`, {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${cron}` },
          });
          const body = await response.json();
          requests.push({ role: "local queue", method: "POST", path: `/api/internal/cron/${queue}`, status: response.status });
          return { status: response.status, body };
        },
        savePassport: async (phone, health, note = "") => {
          const entry = entries[phone];
          const current = await api("seller", "GET", `/api/v1/owner/listings/${entry.id}/passport`);
          if (current.status !== 200) throw new Error("Cannot read fixture seller passport.");
          return api("seller", "PUT", `/api/v1/owner/listings/${entry.id}/passport`, {
            expected_revision: current.body.data.passport?.revision || 0, model: entry.model, battery_health_percent: health,
            checks: Object.fromEntries(checks.map(checkId => [checkId, { answer: "ok", notes: checkId === "battery" ? note : "", photo_ids: [] }])),
          });
        },
        changePrice: (phone, amount) => api("seller", "PATCH", `/api/v1/listings/${entries[phone].id}`, { price: { amount, currency: "EUR" } }),
        setMissionState: async (missionId, state) => {
          const row = await missionRow(missionId);
          const criteria = { ...row.criteria, mission: { ...row.criteria.mission, expires_at: new Date(Date.now() + (state === "EXPIRED" ? -3_600_000 : 86_400_000)).toISOString() } };
          checked((await db.from("watchlists").update({ active: state !== "PAUSED", criteria }).eq("watchlist_id", missionId).eq("agent_id", row.agent_id)).error, "Change own mission fixture state");
        },
        hideListing: async phone => checked((await db.from("moderation_states").upsert({ entity_type: "listing", entity_id: entries[phone].id, hidden: true }, { onConflict: "entity_type,entity_id" })).error, "Hide own fixture phone"),
        alertRows: async missionId => {
          await missionRow(missionId);
          const result = await db.from("watchlist_matches").select("watchlist_match_id,entity_id,matched_at,reason").eq("watchlist_id", missionId).order("entity_id");
          checked(result.error, "Read own persisted alerts");
          return result.data || [];
        },
        externalDeliveries: async () => {
          const result = await db.from("notification_outbox").select("notification_outbox_id", { head: true, count: "exact" }).in("owner_id", Object.values(owners));
          checked(result.error, "Inspect own notification outbox");
          return result.count || 0;
        },
      });
    } catch (error) { failed = true; primary = error; }
    finally {
      const ownerIds = Object.values(owners);
      if (userIds.length) {
        const links = await db.from("owner_auth_links").select("owner_id").in("supabase_user_id", userIds);
        if (links.error) cleanupErrors.push("Resolve fixture Auth-linked owners");
        else for (const link of links.data) if (!ownerIds.includes(link.owner_id)) ownerIds.push(link.owner_id);
      }
      async function remove(label: string, operation: PromiseLike<{ error: { code?: string; status?: number } | null }>) {
        try { checked((await operation).error, label); } catch { cleanupErrors.push(label); }
      }
      // Resolve exact own mission IDs, including creation whose response was lost.
      if (ownerIds.length) {
        const agents = await db.from("agents").select("id").in("owner_id", ownerIds);
        if (agents.error) cleanupErrors.push("Resolve fixture agents");
        else if (agents.data.length) {
          const missions = await db.from("watchlists").select("watchlist_id").in("agent_id", agents.data.map(row => row.id));
          if (missions.error) cleanupErrors.push("Resolve fixture missions");
          else missions.data.forEach(row => missionIds.add(row.watchlist_id));
        }
      }
      await remove("fixture listing queue", db.from("watchlist_match_queue").delete().eq("entity_type", "listing").in("entity_id", listingIds));
      await remove("fixture moderation", db.from("moderation_states").delete().eq("entity_type", "listing").in("entity_id", listingIds));
      await remove("fixture listings", db.from("listings").delete().in("listing_id", listingIds));
      await remove("fixture seller key", db.from("api_keys").delete().eq("agent_id", sellerAgentId));
      if (ownerIds.length) {
        await remove("fixture owner sessions", db.from("owner_sessions").delete().in("owner_id", ownerIds));
        await remove("fixture agents and missions", db.from("agents").delete().in("owner_id", ownerIds));
        await remove("fixture owners", db.from("owners").delete().in("owner_id", ownerIds));
      }
      for (const userId of userIds) await remove("synthetic Auth user", db.auth.admin.deleteUser(userId));
      // Passport/moderation DELETE triggers can enqueue after the first drain.
      await remove("fixture queue after delete triggers", db.from("watchlist_match_queue").delete().eq("entity_type", "listing").in("entity_id", listingIds));
      try {
        const redis = getRedis();
        const keys = [`auth:api_key_prefix:${sellerKey.prefix}`, `sse:stream:agent:v1:${sellerAgentId}`];
        await redis.del(...keys);
        remaining.redisOwnedKeys = await redis.exists(...keys);
        if (remaining.redisOwnedKeys !== 0) cleanupErrors.push("Residual fixture Redis keys");
      } catch { remaining.redisOwnedKeys = null; cleanupErrors.push("Delete/verify fixture Redis keys"); }
      for (const [table, column, values] of [
        ["api_keys", "agent_id", [sellerAgentId]],
        ["owners", "owner_id", ownerIds], ["agents", "owner_id", ownerIds], ["owner_sessions", "owner_id", ownerIds], ["owner_auth_links", "owner_id", ownerIds],
        ["listings", "listing_id", listingIds], ["smartphone_passports", "listing_id", listingIds], ["moderation_states", "entity_id", listingIds],
        ["watchlist_match_queue", "entity_id", listingIds], ["watchlists", "watchlist_id", [...missionIds]], ["watchlist_matches", "watchlist_id", [...missionIds]],
        ["watchlist_backfill_queue", "watchlist_id", [...missionIds]], ["smartphone_mission_match_state", "watchlist_id", [...missionIds]], ["notification_outbox", "owner_id", ownerIds],
      ] as [string, string, string[]][]) {
        if (!values.length) continue;
        try {
          const result = await db.from(table).select(column, { head: true, count: "exact" }).in(column, values);
          remaining[table] = result.count;
          if (result.error || result.count !== 0) cleanupErrors.push(`Residual ${table}`);
        } catch { remaining[table] = null; cleanupErrors.push(`Residual ${table}`); }
      }
      for (const userId of userIds) {
        const result = await db.auth.admin.getUserById(userId);
        if (result.data?.user || result.error?.status !== 404) cleanupErrors.push("Residual Auth user or unverified deletion");
      }
      const directory = join(process.env.PARITY_OUTPUT || ".e2e", "passport-mission-fixtures");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `${id}.json`), JSON.stringify({
        fixtureId: id, appOrigin: origin, backendOrigin: backend, redisOrigin, sellerAgentId, userIds, ownerIds, listingIds, missionIds: [...missionIds],
        requests, refused, remaining, cleanupErrors, fixtureFailed: failed, missionWriteCount: missionWrites.length,
        realServices: ["app API", "Supabase Auth", "owner cookie bridge", "native Postgres", "real local matching queues"],
        redisFixture: process.env.TESTERARMY_REDIS_FIXTURE || "not qualified", credentialsRecorded: false, networkTrace: false,
        externalDeliveryInvoked: false, apiResponseInterception: false,
        testOutcome: "See the SDK report; fixture cleanup is independent of test verdict.",
      }, null, 2) + "\n", { flag: "wx" });
    }
    if (failed) throw primary;
    if (cleanupErrors.length) throw new Error(`Passport mission cleanup failed: ${cleanupErrors.join(", ")}`);
  },
});
