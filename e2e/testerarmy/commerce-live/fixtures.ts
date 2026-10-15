import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base } from "@e2e-dev/web";
import { assertNonProdFromEnv } from "../../../scripts/lib/assert-non-prod-target.mjs";
import { generateApiKey, hashApiKeySecret } from "../../../src/server/utils/api-keys";
import { evaluateWatchlistMatchListing } from "../../../src/server/utils/matching";
import { normalizePolicyInput } from "../../../src/server/policy/policy";
import { getRedis } from "../../../src/server/redis/upstash";

type Role = "buyer" | "seller";
type Party = { userId: string; ownerId: string; agentId: string; email: string; phoneE164: string };
export type CommerceFixture = {
  id: string;
  buyer: Party;
  seller: Party;
  suspendedBuyerAgentId: string;
  listing: { id: string; title: string; query: string; price: number; market: "FR"; lat: number; lon: number };
  db: SupabaseClient;
  installBrowserGuard: () => Promise<void>;
  asAgent: (role: Role, method: string, path: string, body?: Record<string, unknown>, idempotencyKey?: string) => Promise<{ status: number; body: any }>;
  expireOwnerSessions: (role: Role) => Promise<void>;
};

const UUID = "[0-9a-f-]{36}";
const PROJECT = "gztfmpuqtpvncdcuhqxy";

// Do not include provider error payloads: they can contain authentication data.
function checked(error: { code?: string; status?: number } | null, operation: string) {
  if (error) throw new Error(`${operation} failed (${error.code || error.status || "backend error"}).`);
}

/** Real Auth/API/Postgres journey; only its starting identities and listing are seeded. */
export const test = base.extend<{ commerceFixture: CommerceFixture }>({
  commerceFixture: async ({ app, browser }, provide) => {
    if (process.env.TESTERARMY_COMMERCE_LIVE !== "1") throw new Error("Live commerce selection is required.");
    assertNonProdFromEnv(process.env, { allowDisposableProduction: true, context: "Live commerce fixture" });
    const backend = new URL(process.env.SUPABASE_URL || "http://missing.invalid");
    const target = new URL(app.baseUrl || "http://missing.invalid");
    if (process.env.CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS !== PROJECT ||
      backend.origin !== `https://${PROJECT}.supabase.co` || backend.username || backend.password ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
      !["http:", "https:"].includes(target.protocol) || target.username || target.password ||
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || backend.origin).origin !== backend.origin) {
      throw new Error("Commerce requires a local app and the exact opted-in disposable ClawDeals backend.");
    }
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const password = process.env.TESTERARMY_COMMERCE_PASSWORD;
    if (!key || !password) throw new Error("Commerce requires server credentials and the maintained runner.");
    const db = createClient(backend.origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = randomUUID();
    const query = `cd${id.replaceAll("-", "")}`;
    const listing = { id: randomUUID(), title: query, query, price: 125, market: "FR" as const, lat: 48.8566, lon: 2.3522 };
    const parties = Object.fromEntries((["buyer", "seller"] as const).map((role, index) => [role, {
      userId: "", ownerId: randomUUID(), agentId: randomUUID(), email: `commerce-${role}-${id}@example.test`,
      // Ofcom drama numbers: https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama
      phoneE164: index === 0 ? "+447700900111" : "+447700900222"
    }])) as Record<Role, Party>;
    const ownerIds = Object.values(parties).map(party => party.ownerId);
    const suspendedBuyerAgentId = randomUUID();
    const agentIds = [...Object.values(parties).map(party => party.agentId), suspendedBuyerAgentId];
    const actorIds = [...ownerIds, ...agentIds];
    const createdUsers: string[] = [];
    const apiKeys = new Map<Role, string>();
    const apiKeyPrefixes: string[] = [];
    const requestIds: string[] = [];
    const requests: { actor: Role; method: string; path: string; status: number }[] = [];
    const refused: { method: string; origin: string; path: string }[] = [];
    const cleanupErrors: string[] = [];
    const remaining: Record<string, number | null> = {};
    let preflightChecked = 0;
    let active = true;
    let failed = false;
    let primary: unknown;
    let graphSafe = true;
    let missionIds: string[] = [];
    let threadIds: string[] = [];
    let offerIds: string[] = [];
    let transactionIds: string[] = [];
    let approvalIds: string[] = [];

    async function readRows(table: string, columns: string, filter: string) {
      const { data, error } = await db.from(table).select(columns).or(filter);
      checked(error, `Read fixture ${table}`);
      return (data || []) as unknown as Record<string, any>[];
    }

    async function ownedPath(path: string) {
      if ([`/api/v1/listings/${listing.id}/offers`, `/api/v1/listings/${listing.id}/threads`].includes(path)) return true;
      const offer = path.match(new RegExp(`^/api/v1/offers/(${UUID})(?:/(?:counter|accept|decline|cancel))?$`));
      const transaction = path.match(new RegExp(`^/api/v1/transactions/(${UUID})(?:/(?:request-contact-reveal|mark-completed))?$`));
      const approval = path.match(new RegExp(`^/api/v1/approvals/(${UUID})(?::(?:approve|deny|revoke))?$`));
      if (offer || transaction) {
        const table = offer ? "offers" : "transactions";
        const column = offer ? "offer_id" : "tx_id";
        const rows = await readRows(table, "listing_id,buyer_agent_id,seller_agent_id", `${column}.eq.${(offer || transaction)![1]}`);
        return rows.length === 1 && rows[0].listing_id === listing.id &&
          rows[0].buyer_agent_id === parties.buyer.agentId && rows[0].seller_agent_id === parties.seller.agentId;
      }
      if (approval) {
        const rows = await readRows("approvals", "owner_id", `approval_id.eq.${approval[1]}`);
        return rows.length === 1 && ownerIds.includes(rows[0].owner_id);
      }
      return false;
    }

    async function installBrowserGuard() { await browser.route("**/*", async route => {
      const url = new URL(route.request.url);
      const { method } = route.request;
      const local = url.origin === target.origin;
      const read = ["GET", "HEAD"].includes(method);
      const login = url.origin === backend.origin && method === "POST" &&
        ((url.pathname === "/auth/v1/token" && ["password", "refresh_token"].includes(url.searchParams.get("grant_type") || "")) ||
          url.pathname === "/auth/v1/logout");
      const localWrite = local && method === "POST" && (
        ["/api/v1/auth/session:bridge", "/api/v1/auth/logout", "/api/v1/owner/missions"].includes(url.pathname) ||
        await ownedPath(url.pathname));
      if (active && ((local && read) || login || localWrite)) await route.continue();
      else {
        refused.push({ method, origin: url.origin, path: url.pathname });
        await route.abort();
      }
    }); }
    await installBrowserGuard();

    const listingRow = {
      listing_id: listing.id, owner_id: parties.seller.ownerId, agent_id: parties.seller.agentId,
      seller_agent_id: parties.seller.agentId, title: listing.title, description: `${query} été`,
      status: "LIVE", category: "unknown", condition: "GOOD", price_amount: listing.price,
      currency: "EUR", market_code: listing.market, geo_lat: listing.lat, geo_lng: listing.lon,
      photos: [], delivery_method: "PICKUP"
    };

    try {
      // LIVE insertion enqueues matching even through direct SQL. Inspect every active
      // watchlist in this market, without retaining its criteria or changing its owner.
      // This preflight is a snapshot, not a lock against concurrent watchlist creation.
      let cursor: string | null = null;
      for (let page = 0; ; page++) {
        if (page === 100) throw new Error("Watchlist preflight exceeded its bounded scan; no listing created.");
        let scan = db.from("watchlists")
          .select("watchlist_id,agent_id,active,market_code,currency,query_text,tags,price_max,geo_lat,geo_lon,distance_km,criteria,deleted_at")
          .eq("active", true).is("deleted_at", null).eq("market_code", listing.market)
          .order("watchlist_id").limit(500);
        if (cursor) scan = scan.gt("watchlist_id", cursor);
        const { data, error } = await scan;
        checked(error, "Read notification preflight");
        for (const watchlist of data || []) {
          preflightChecked++;
          if (!agentIds.includes(watchlist.agent_id) && evaluateWatchlistMatchListing({ listing: listingRow, watchlist }).matched) {
            throw new Error("Notification preflight found a matching watchlist outside the fixture; no listing created.");
          }
        }
        if (!data?.length || data.length < 500) break;
        cursor = data[data.length - 1].watchlist_id;
      }

      const now = new Date().toISOString();
      for (const role of ["buyer", "seller"] as const) {
        const party = parties[role];
        const user = await db.auth.admin.createUser({ email: party.email, password, email_confirm: true });
        checked(user.error, `Create ${role} Auth user`);
        if (!user.data.user) throw new Error(`Missing ${role} Auth user.`);
        party.userId = user.data.user.id;
        createdUsers.push(party.userId);
        checked((await db.from("owners").insert({
          owner_id: party.ownerId, email: party.email, email_verified_at: now,
          phone_e164: party.phoneE164, phone_verified_at: now
        })).error, `Create ${role} owner`);
        checked((await db.from("notification_preferences").insert({
          owner_id: party.ownerId, mode: "SILENT", event_types: [], channel_identity_id: null
        })).error, `Silence ${role} notifications`);
        checked((await db.from("owner_auth_links").insert({
          owner_id: party.ownerId, auth_provider: "supabase", auth_subject: party.userId,
          supabase_user_id: party.userId, email: party.email, email_verified_at: now
        })).error, `Link ${role} Auth identity`);
        if (role === "buyer") {
          // Earlier suspended row reproduces the historical unordered limit(1)
          // selection. It has no API key and must never receive the new mission.
          checked((await db.from("agents").insert({
            id: suspendedBuyerAgentId, owner_id: party.ownerId, name: `Commerce suspended ${id}`,
            created_at: new Date(Date.now() - 20 * 86400_000).toISOString(), suspended_at: now,
            trust_score: 90, trust_flags: []
          })).error, "Create suspended buyer agent counterexample");
        }
        checked((await db.from("agents").insert({
          id: party.agentId, owner_id: party.ownerId, name: `Commerce ${role} ${id}`,
          created_at: new Date(Date.now() - 10 * 86400_000).toISOString(), trust_score: 90, trust_flags: []
        })).error, `Create ${role} agent`);
        const generated = generateApiKey();
        checked((await db.from("api_keys").insert({
          agent_id: party.agentId, key_prefix: generated.prefix, key_hash: await hashApiKeySecret(generated.secret),
          key_state: "ACTIVE", scope: "full"
        })).error, `Create ${role} API key`);
        apiKeys.set(role, generated.apiKey);
        apiKeyPrefixes.push(generated.prefix);
        checked((await db.from("policies").insert({ owner_id: party.ownerId, version: 1, policy_json: {
          ...normalizePolicyInput({
            budgets: { max_offer: 200, currency: "EUR" },
            approval_thresholds: { offer_amount_gt: 200, contact_reveal: "always" },
            auto_approve: { message_types: [], actions: ["listing.create", "thread.create", "offer.accept"] }
          }), version: 1
        } })).error, `Create ${role} policy`);
      }
      checked((await db.from("listings").insert(listingRow)).error, "Create fixture listing");

      await provide({
        id, buyer: parties.buyer, seller: parties.seller, suspendedBuyerAgentId, listing, db, installBrowserGuard,
        asAgent: async (role, method, path, body, idempotencyKey = randomUUID()) => {
          const verb = method.toUpperCase();
          if (!active || !apiKeys.has(role) || !["GET", "POST"].includes(verb) ||
            !path.startsWith("/api/v1/") || path.includes("?") || !(await ownedPath(path))) {
            throw new Error("Agent request must target this fixture's commerce entities.");
          }
          if (body?.mission_id) {
            if (typeof body.mission_id !== "string" || !new RegExp(`^${UUID}$`).test(body.mission_id)) throw new Error("Invalid fixture mission ID.");
            const rows = await readRows("watchlists", "agent_id", `watchlist_id.eq.${body.mission_id}`);
            if (rows.length !== 1 || rows[0].agent_id !== parties.buyer.agentId) throw new Error("Mission is outside the fixture.");
          }
          const requestId = randomUUID();
          requestIds.push(requestId);
          const response = await fetch(new URL(path, target.origin), {
            method: verb, redirect: "error", signal: AbortSignal.timeout(30_000),
            headers: { Authorization: `Bearer ${apiKeys.get(role)}`, "Content-Type": "application/json", "x-request-id": requestId,
              ...(verb === "POST" ? { "Idempotency-Key": idempotencyKey } : {}) },
            ...(body && verb !== "GET" ? { body: JSON.stringify(body) } : {})
          });
          requests.push({ actor: role, method: verb, path, status: response.status });
          const payload = await response.json();
          return { status: response.status, body: payload };
        },
        expireOwnerSessions: async role => {
          if (!active || !parties[role]) throw new Error("Unknown fixture owner.");
          const at = new Date().toISOString();
          checked((await db.from("owner_sessions").update({ status: "EXPIRED", expired_at: at, updated_at: at })
            .eq("owner_id", parties[role].ownerId).eq("status", "ACTIVE")).error, "Expire fixture owner sessions");
        }
      });
    } catch (error) { failed = true; primary = error; }
    finally { active = false; apiKeys.clear(); }

    async function cleanup(label: string, action: () => PromiseLike<{ error: { code?: string; status?: number } | null }>) {
      try { checked((await action()).error, label); }
      catch { cleanupErrors.push(label); }
    }
    async function remove(table: string, column: string, ids: string[]) {
      if (ids.length) await cleanup(`Delete ${table}`, () => db.from(table).delete().in(column, ids));
    }
    async function count(table: string, column: string, ids: string[]) {
      if (!ids.length) return;
      try {
        const result = await db.from(table).select(column, { head: true, count: "exact" }).in(column, ids);
        remaining[`${table}.${column}`] = result.count;
        if (result.error || result.count !== 0) cleanupErrors.push(`Residual check ${table}.${column}`);
      } catch {
        remaining[`${table}.${column}`] = null;
        cleanupErrors.push(`Residual check ${table}.${column}`);
      }
    }

    await remove("owner_sessions", "owner_id", ownerIds);
    await remove("api_keys", "agent_id", agentIds);
    // Inspect the business graph before any cascading deletion. A concurrent third
    // party interaction makes cleanup fail closed rather than deleting their data.
    try {
      const participantFilter = `listing_id.eq.${listing.id},buyer_agent_id.in.(${agentIds.join(",")}),seller_agent_id.in.(${agentIds.join(",")})`;
      const threads = await readRows("threads", "thread_id,listing_id,buyer_agent_id,seller_agent_id", participantFilter);
      const offers = await readRows("offers", "offer_id,listing_id,buyer_agent_id,seller_agent_id,proposed_by_agent_id", participantFilter);
      const transactions = await readRows("transactions", "tx_id,listing_id,buyer_agent_id,seller_agent_id", participantFilter);
      const { data: ownListingMatches, error: matchError } = await db.from("watchlist_matches").select("agent_id")
        .eq("entity_type", "listing").eq("entity_id", listing.id);
      checked(matchError, "Inspect listing matches");
      const approvals = await readRows("approvals", "approval_id,owner_id,created_by_agent_id,resolved_by_human_id", `owner_id.in.(${ownerIds.join(",")})`);
      const missions = await readRows("watchlists", "watchlist_id", `agent_id.in.(${agentIds.join(",")})`);
      if ([...threads, ...offers, ...transactions].some(row => row.listing_id !== listing.id ||
        row.buyer_agent_id !== parties.buyer.agentId || row.seller_agent_id !== parties.seller.agentId ||
        (row.proposed_by_agent_id && !agentIds.includes(row.proposed_by_agent_id))) ||
        (ownListingMatches || []).some(row => !agentIds.includes(row.agent_id)) ||
        approvals.some(row => (row.created_by_agent_id && !agentIds.includes(row.created_by_agent_id)) ||
          (row.resolved_by_human_id && !ownerIds.includes(row.resolved_by_human_id)))) {
        throw new Error("Third party relation in fixture graph.");
      }
      threadIds = threads.map(row => row.thread_id);
      offerIds = offers.map(row => row.offer_id);
      transactionIds = transactions.map(row => row.tx_id);
      approvalIds = approvals.map(row => row.approval_id);
      missionIds = missions.map(row => row.watchlist_id);
    } catch { graphSafe = false; cleanupErrors.push("Business graph inspection failed; cascading cleanup withheld."); }

    if (graphSafe) {
      await remove("approval_jobs", "approval_id", approvalIds);
      await remove("approvals", "approval_id", approvalIds);
      await remove("transactions", "tx_id", transactionIds);
      await remove("offers", "offer_id", offerIds);
      await remove("threads", "thread_id", threadIds);
      await cleanup("Delete listing match queue", () => db.from("watchlist_match_queue").delete().eq("entity_type", "listing").eq("entity_id", listing.id));
      await remove("listings", "listing_id", [listing.id]);
      await remove("acquisition_funnel_events", "agent_id", agentIds);
      await remove("acquisition_funnel_events", "watchlist_id", missionIds);
      await remove("watchlists", "watchlist_id", missionIds);
      // These records have no cascading owner/agent FK, or use SET NULL.
      await remove("idempotency_keys", "actor_id", actorIds);
      await remove("audit_logs", "actor->>id", actorIds);
      await remove("audit_logs", "auth->>owner_id", ownerIds);
      await remove("audit_logs", "request_id", requestIds);
      await remove("oauth_device_authorizations", "owner_id", ownerIds);
      await remove("connect_sessions", "owner_id", ownerIds);
      await remove("agents", "id", agentIds);
      await remove("owners", "owner_id", ownerIds);
    }
    for (const userId of createdUsers) await cleanup("Delete synthetic Auth user", () => db.auth.admin.deleteUser(userId));
    // Never SCAN/FLUSH or delete the shared ops stream. Key names are built only
    // from IDs/prefixes allocated above and are never exported with credentials.
    if (apiKeyPrefixes.length) {
      try {
        const redis = getRedis();
        const keys = [
          ...apiKeyPrefixes.map(prefix => `auth:api_key_prefix:${prefix}`),
          ...agentIds.map(agentId => `sse:stream:agent:v1:${agentId}`),
          ...threadIds.map(threadId => `thread:stream:v1:${threadId}`)
        ];
        await redis.del(...keys);
        remaining.redisOwnedKeys = await redis.exists(...keys);
        if (remaining.redisOwnedKeys !== 0) cleanupErrors.push("Residual fixture Redis keys");
      } catch { remaining.redisOwnedKeys = null; cleanupErrors.push("Delete/verify fixture Redis keys"); }
    }

    for (const [table, column, ids] of [
      ["transactions", "tx_id", transactionIds], ["escrows", "tx_id", transactionIds], ["ratings", "tx_id", transactionIds],
      ["offers", "offer_id", offerIds], ["threads", "thread_id", threadIds], ["messages", "thread_id", threadIds],
      ["approvals", "owner_id", ownerIds], ["approval_jobs", "approval_id", approvalIds],
      ["listings", "listing_id", [listing.id]], ["watchlist_match_queue", "entity_id", [listing.id]],
      ["watchlists", "agent_id", agentIds], ["watchlist_matches", "agent_id", agentIds],
      ["watchlist_backfill_queue", "watchlist_id", missionIds], ["trustscore_recalc_queue", "agent_id", agentIds],
      ["api_keys", "agent_id", agentIds], ["owner_sessions", "owner_id", ownerIds],
      ["owner_auth_links", "owner_id", ownerIds], ["notification_preferences", "owner_id", ownerIds],
      ["notification_outbox", "owner_id", ownerIds], ["policies", "owner_id", ownerIds],
      ["idempotency_keys", "actor_id", actorIds], ["audit_logs", "actor->>id", actorIds],
      ["audit_logs", "auth->>owner_id", ownerIds], ["audit_logs", "request_id", requestIds],
      ["acquisition_funnel_events", "agent_id", agentIds], ["acquisition_funnel_events", "watchlist_id", missionIds],
      ["oauth_device_authorizations", "owner_id", ownerIds], ["connect_sessions", "owner_id", ownerIds],
      ["agents", "id", agentIds], ["owners", "owner_id", ownerIds]
    ] as [string, string, string[]][]) await count(table, column, ids);
    for (const userId of createdUsers) {
      try {
        const result = await db.auth.admin.getUserById(userId);
        const absent = result.error?.status === 404 || result.error?.code === "user_not_found";
        remaining[`auth.${userId}`] = absent ? 0 : result.data.user ? 1 : null;
        if (!absent) cleanupErrors.push("Verify synthetic Auth deletion");
      } catch { remaining[`auth.${userId}`] = null; cleanupErrors.push("Verify synthetic Auth deletion"); }
    }
    const directory = join(process.env.PARITY_OUTPUT || ".e2e", "commerce-fixtures");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${id}.json`), JSON.stringify({
      fixtureId: id, appOrigin: target.origin, backendOrigin: backend.origin,
      userIds: createdUsers, ownerIds, agentIds, listingId: listing.id, missionIds, threadIds, offerIds, transactionIds, approvalIds,
      notificationPreflight: { checked: preflightChecked, snapshotOnly: true, criteriaRecorded: false },
      realServices: ["app API", "Supabase Auth", "Postgres persistence"],
      redisFixture: process.env.TESTERARMY_REDIS_FIXTURE || "configured service; not independently qualified",
      redisCleanup: "Owned key caches and agent/thread streams deleted and checked. Rate-limit counters and the shared ops stream retain their configured TTL.",
      fixtureError: failed, graphSafe, cleanupErrors, remaining, requests, refused,
      credentialsRecorded: false, networkTrace: false,
      testOutcome: "See SDK report; fixture cleanup is independent of the test verdict."
    }, null, 2) + "\n", { flag: "wx" });
    if (failed) throw primary;
    if (cleanupErrors.length) throw new Error(`Commerce fixture cleanup failed: ${cleanupErrors.join("; ")}`);
  }
});
