import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));

import { getSupabaseServiceClient } from "../db/supabase";
import { createWatchlist, deleteWatchlistForAgent, updateWatchlistForAgent } from "./watchlists";

const NOW = "2026-10-15T10:00:00.000Z";
const FUTURE = "2026-10-16T10:00:00.000Z";
const PAST = "2026-10-14T10:00:00.000Z";
type Row = Record<string, any>;

function row(id: string, expiresAt?: string): Row {
  return {
    watchlist_id: id, agent_id: "agent-1", active: true, deleted_at: null, market_code: "FR",
    criteria: expiresAt ? { mission: { kind: "BUY", currency: "EUR", expires_at: expiresAt } } : { query: "bike" }
  };
}

// Browser fixtures do not exercise the database quota. Use the real Supabase
// request builder with a small PostgREST transport to test the service boundary.
function installDatabase(rows: Row[]) {
  const writes: { method: string; ids: string[] }[] = [];
  function matches(item: Row, field: string, filter: string) {
    const value = field.split(/->>?/).reduce((part, key) => part?.[key], item);
    if (filter === "is.null") return value == null;
    if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
    if (filter.startsWith("gt.")) return value != null && String(value) > filter.slice(3);
    throw new Error(`Unexpected test filter: ${filter}`);
  }
  const client = createClient("http://quota.test", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || "GET";
      let selected = rows;
      for (const [field, filter] of url.searchParams) {
        if (field === "select") continue;
        if (field === "or") {
          const alternatives = filter.slice(1, -1).split(",");
          selected = selected.filter((item) => alternatives.some((alternative) => {
            const separator = alternative.indexOf(".");
            return matches(item, alternative.slice(0, separator), alternative.slice(separator + 1));
          }));
        } else selected = selected.filter((item) => matches(item, field, filter));
      }
      if (method === "HEAD") return new Response(null, { headers: { "content-range": `*/${selected.length}` } });
      if (method === "POST") {
        const inserted = { watchlist_id: "new-watchlist", ...JSON.parse(String(init?.body)) };
        rows.push(inserted);
        writes.push({ method, ids: [inserted.watchlist_id] });
        return Response.json(inserted, { status: 201 });
      }
      if (method === "PATCH") {
        for (const item of selected) Object.assign(item, JSON.parse(String(init?.body)));
        writes.push({ method, ids: selected.map((item) => item.watchlist_id) });
      }
      return Response.json(selected);
    } }
  });
  vi.mocked(getSupabaseServiceClient).mockReturnValue(client);
  return writes;
}

function createActive() {
  return createWatchlist({
    agentId: "agent-1", name: "New search", active: true, criteria: { query: "bike" }, queryText: "bike",
    tags: [], priceMax: null, marketCode: "FR", currency: "EUR", geoLat: null, geoLon: null, distanceKm: null
  });
}

describe("active watchlist quota", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

  it("allows the fiftieth active watchlist despite expired missions, without mutating them", async () => {
    const expired = [row("expired", PAST), row("expires-now", NOW)];
    const rows = [...Array.from({ length: 49 }, (_, i) => row(`ordinary-${i}`)), ...expired];
    const writes = installDatabase(rows);
    expect(await createActive()).toMatchObject({ watchlist_id: "new-watchlist", active: true });
    expect(expired.every((item) => item.active === true)).toBe(true);
    expect(writes).toEqual([{ method: "POST", ids: ["new-watchlist"] }]);
  });

  it.each([undefined, FUTURE])("still blocks fifty non-expired watchlists (expiry %s)", async (expiry) => {
    const writes = installDatabase(Array.from({ length: 50 }, (_, i) => row(`active-${i}`, expiry)));
    await expect(createActive()).rejects.toMatchObject({ status: 409, code: "WATCHLIST_LIMIT_REACHED", activeLimit: 50 });
    expect(writes).toEqual([]);
  });

  it.each([PAST, FUTURE])("applies the same quota when resuming a watchlist (other mission expiry %s)", async (expiry) => {
    const paused = { ...row("paused"), active: false };
    const rows = [...Array.from({ length: 49 }, (_, i) => row(`ordinary-${i}`)), row("mission", expiry), paused];
    const writes = installDatabase(rows);
    const result = updateWatchlistForAgent({ watchlistId: "paused", agentId: "agent-1", patch: { active: true } });
    if (expiry === FUTURE) {
      await expect(result).rejects.toMatchObject({ status: 409, code: "WATCHLIST_LIMIT_REACHED" });
      expect(writes).toEqual([]);
    } else {
      expect(await result).toMatchObject({ watchlist_id: "paused", active: true });
      expect(writes).toEqual([{ method: "PATCH", ids: ["paused"] }]);
    }
  });

  it.each([
    [49, "renew"], [50, "renew"], [49, "ordinary"], [50, "ordinary"]
  ] as const)("checks %i occupied slots when an expired mission becomes %s", async (occupied, change) => {
    const expired = row("expired", PAST);
    const rows = [...Array.from({ length: occupied }, (_, i) => row(`ordinary-${i}`)), expired];
    const writes = installDatabase(rows);
    const criteria = change === "renew"
      ? { mission: { ...expired.criteria.mission, expires_at: FUTURE } }
      : { query: "bike" };
    const update = () => updateWatchlistForAgent({ watchlistId: "expired", agentId: "agent-1", patch: { criteria } });
    if (occupied === 50) {
      await expect(update()).rejects.toMatchObject({ status: 409, code: "WATCHLIST_LIMIT_REACHED" });
      expect(expired.criteria.mission.expires_at).toBe(PAST);
      expect(writes).toEqual([]);
    } else {
      expect(await update()).toMatchObject({ watchlist_id: "expired", active: true, criteria });
      // Repeating the same update already occupies one of the fifty slots.
      expect(await update()).toMatchObject({ watchlist_id: "expired", active: true, criteria });
      expect(rows).toHaveLength(50);
      expect(writes).toEqual([
        { method: "PATCH", ids: ["expired"] }, { method: "PATCH", ids: ["expired"] }
      ]);
    }
  });

  it.each([{ name: "Renamed expired mission" }, { active: true }, { active: false }])(
    "allows a full-quota update that leaves the mission expired: %j", async patch => {
      const expired = row("expired", PAST);
      const writes = installDatabase([...Array.from({ length: 50 }, (_, i) => row(`ordinary-${i}`)), expired]);
      expect(await updateWatchlistForAgent({ watchlistId: "expired", agentId: "agent-1", patch }))
        .toMatchObject({ watchlist_id: "expired", ...patch, criteria: { mission: { expires_at: PAST } } });
      expect(writes).toEqual([{ method: "PATCH", ids: ["expired"] }]);
    }
  );

  it("does not consume a slot when a paused mission stays expired or is deleted", async () => {
    const expired = { ...row("expired", PAST), active: false };
    const writes = installDatabase([...Array.from({ length: 50 }, (_, i) => row(`ordinary-${i}`)), expired]);
    expect(await updateWatchlistForAgent({ watchlistId: "expired", agentId: "agent-1", patch: { active: true } }))
      .toMatchObject({ watchlist_id: "expired", active: true, criteria: { mission: { expires_at: PAST } } });
    expect(await deleteWatchlistForAgent({ watchlistId: "expired", agentId: "agent-1" }))
      .toMatchObject({ watchlist_id: "expired", active: false, deleted_at: NOW });
    expect(writes).toEqual([
      { method: "PATCH", ids: ["expired"] }, { method: "PATCH", ids: ["expired"] }
    ]);
  });

  it("continues excluding other agents, paused and deleted watchlists", async () => {
    const rows = [
      ...Array.from({ length: 49 }, (_, i) => row(`ordinary-${i}`)),
      { ...row("other-agent"), agent_id: "agent-2" },
      { ...row("paused"), active: false },
      { ...row("deleted"), deleted_at: PAST }
    ];
    installDatabase(rows);
    expect(await createActive()).toMatchObject({ watchlist_id: "new-watchlist", active: true });
  });
});
