import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base } from "@e2e-dev/web";
import { assertNonProdFromEnv } from "../../../scripts/lib/assert-non-prod-target.mjs";

type Fixture = {
  id: string;
  email: string;
  db: SupabaseClient;
  missionWrites: { idempotencyKey: string; body: string }[];
  createListing: (market: "FR" | "GB", price: number) => Promise<{ id: string; title: string }>;
};

/** Real disposable backend data. No password, cookie or auth payload is recorded. */
export const test = base.extend<{ missionFixture: Fixture }>({
  missionFixture: async ({ app, browser }, provide) => {
    if (process.env.TESTERARMY_MISSION_LIVE !== "1") throw new Error("Live mission selection is required.");
    assertNonProdFromEnv(process.env, { allowDisposableProduction: true, context: "Live first mission fixture" });
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const password = process.env.TESTERARMY_MISSION_PASSWORD;
    if (!url || !key || !password) throw new Error("Live missions require server credentials and the maintained runner.");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = randomUUID();
    const email = `mission-${id}@example.test`;
    const origin = new URL(app.baseUrl!).origin;
    const authOrigin = new URL(url).origin;
    const refused: { method: string; origin: string; path: string }[] = [];
    const missionWrites: { idempotencyKey: string; body: string }[] = [];
    await browser.route("**/*", async route => {
      const requestUrl = new URL(route.request.url);
      const { method } = route.request;
      const sameOrigin = requestUrl.origin === origin;
      const read = ["GET", "HEAD"].includes(method);
      const appWrite = sameOrigin && method === "POST" && [
        "/api/v1/auth/session:bridge", "/api/v1/owner/missions"
      ].includes(requestUrl.pathname);
      const login = requestUrl.origin === authOrigin && method === "POST" &&
        requestUrl.pathname === "/auth/v1/token" && requestUrl.searchParams.get("grant_type") === "password";
      if (appWrite && requestUrl.pathname === "/api/v1/owner/missions") {
        missionWrites.push({ idempotencyKey: route.request.headers["idempotency-key"], body: route.request.postData || "" });
      }
      if ((sameOrigin && read) || appWrite || login) await route.continue();
      else {
        refused.push({ method, origin: requestUrl.origin, path: requestUrl.pathname });
        await route.abort();
      }
    });

    const ownerIds: string[] = [];
    const listingIds: string[] = [];
    let userId: string | undefined;
    let primary: unknown;
    let failed = false;
    const cleanupErrors: string[] = [];
    const check = (error: { message: string } | null, operation: string) => {
      if (error) throw new Error(`${operation}: ${error.message}`);
    };
    try {
      const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
      check(user.error, "Create synthetic Auth user");
      userId = user.data.user!.id;
      await provide({ id, email, db, missionWrites, createListing: async (market, price) => {
        const ownerId = randomUUID();
        const owner = await db.from("owners").insert({ owner_id: ownerId });
        check(owner.error, "Create synthetic seller");
        ownerIds.push(ownerId);
        const agent = await db.from("agents").insert({ owner_id: ownerId, name: `Mission fixture ${id}` }).select("id").single();
        check(agent.error, "Create synthetic seller agent");
        const listingId = randomUUID();
        const title = `Mission bicycle ${id}`;
        const listing = await db.from("listings").insert({
          listing_id: listingId, title, description: "Disposable first mission fixture. No seller contact.",
          owner_id: ownerId, agent_id: agent.data!.id, seller_agent_id: agent.data!.id,
          status: "LIVE", category: "mobility", condition: "GOOD", price_amount: price,
          currency: market === "GB" ? "GBP" : "EUR", market_code: market,
          geo_lat: market === "GB" ? 51.5074 : 48.8566, geo_lng: market === "GB" ? -0.1278 : 2.3522,
          photos: [], delivery_method: "PICKUP"
        });
        check(listing.error, "Create synthetic listing");
        listingIds.push(listingId);
        return { id: listingId, title };
      } });
    } catch (error) { failed = true; primary = error; }

    async function cleanup(label: string, action: () => PromiseLike<{ error: { message: string } | null }>) {
      try { const result = await action(); check(result.error, label); }
      catch (error) { cleanupErrors.push(error instanceof Error ? error.message : label); }
    }
    if (userId) {
      const links = await db.from("owner_auth_links").select("owner_id").eq("supabase_user_id", userId);
      if (links.error) cleanupErrors.push(`Resolve owned account: ${links.error.message}`);
      else ownerIds.push(...(links.data || []).map(row => row.owner_id));
    }
    if (listingIds.length) await cleanup("Delete fixture listings", () => db.from("listings").delete().in("listing_id", listingIds));
    if (ownerIds.length) {
      await cleanup("Revoke fixture owner sessions", () => db.from("owner_sessions").delete().in("owner_id", ownerIds));
      // Agent deletion cascades to only its watchlists and matches.
      await cleanup("Delete fixture agents and missions", () => db.from("agents").delete().in("owner_id", ownerIds));
      await cleanup("Delete fixture owners", () => db.from("owners").delete().in("owner_id", ownerIds));
    }
    if (userId) await cleanup("Delete synthetic Auth user", () => db.auth.admin.deleteUser(userId!));
    const remaining: Record<string, number | null> = {};
    for (const [table, column, values] of [
      ["owners", "owner_id", ownerIds], ["agents", "owner_id", ownerIds], ["listings", "listing_id", listingIds]
    ] as const) {
      if (!values.length) continue;
      const result = await db.from(table).select(column, { head: true, count: "exact" }).in(column, values);
      remaining[table] = result.count;
      if (result.error) cleanupErrors.push(`Verify ${table} cleanup: ${result.error.message}`);
      else if (result.count !== 0) cleanupErrors.push(`Fixture rows remain in ${table}: ${result.count}`);
    }
    const directory = join(process.env.PARITY_OUTPUT || ".e2e", "mission-fixtures");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${id}.json`), JSON.stringify({
      fixtureId: id, appOrigin: origin, backendOrigin: authOrigin, userId, ownerIds, listingIds,
      realServices: ["app API", "Supabase Auth", "Postgres persistence"],
      redisFixture: process.env.TESTERARMY_REDIS_FIXTURE || "configured service; not independently qualified",
      fixtureError: failed, cleanupErrors, remaining, refused, missionWriteCount: missionWrites.length,
      testOutcome: "See the SDK report; fixture teardown is independent of the test verdict.",
      credentialsRecorded: false, networkTrace: false
    }, null, 2) + "\n", { flag: "wx" });
    if (failed) throw primary;
    if (cleanupErrors.length) throw new Error(`Mission fixture cleanup failed: ${cleanupErrors.join("; ")}`);
  }
});
