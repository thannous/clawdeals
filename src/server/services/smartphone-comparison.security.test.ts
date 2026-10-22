import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), passport: vi.fn() }));
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: mocks.client }));
vi.mock("./smartphone-passports", () => ({ getSmartphonePassport: mocks.passport }));
import { getSmartphoneComparison } from "./smartphone-comparison";
import { handler } from "../../pages/api/v1/public/smartphone-comparison";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function row(id = A) {
  return { listing_id: id, title: "iPhone 14", category: "electronics", condition: "GOOD", price_amount: 30000, currency: "EUR", market_code: "FR", status: "LIVE" };
}
type DatabaseResult = { data?: any; error?: any };
function database(results: Record<string, Array<DatabaseResult | (() => DatabaseResult)>>) {
  const queries: any[] = [];
  const client = { from: vi.fn((table: string) => {
    const queryRecord: any = { table, filters: {} };
    queries.push(queryRecord);
    function take(id: string): DatabaseResult {
      const result = results[table === "moderation_states" ? `moderation:${id}` : id]?.shift();
      return typeof result === "function" ? result() : result || { data: null, error: null };
    }
    const query: any = {
      select: (columns: string) => { queryRecord.columns = columns; return query; },
      eq: (name: string, value: string) => { queryRecord.filters[name] = value; return query; },
      in: (name: string, values: string[]) => { queryRecord.filters[name] = values; return query; },
      maybeSingle: async () => take(table === "moderation_states" ? queryRecord.filters.entity_id : queryRecord.filters.listing_id),
      then: (resolve: (result: DatabaseResult) => unknown, reject: (error: unknown) => unknown) => {
        const ids: string[] = table === "moderation_states" ? queryRecord.filters.entity_id : queryRecord.filters.listing_id;
        const rows = ids.map(take);
        const error = rows.find((result) => result.error)?.error;
        return Promise.resolve({ data: rows.flatMap((result) => result.data ? [result.data] : []), error }).then(resolve, reject);
      }
    };
    return query;
  }) };
  mocks.client.mockReturnValue(client);
  return { client, queries };
}

// These focused service/handler checks complement the real local browser flow.
// They isolate visibility races and partial database failures that are difficult
// to trigger deterministically through end-to-end interactions.
describe("public smartphone comparison boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.passport.mockResolvedValue(null); });
  it.each([undefined, [A], `${A},${A}`, `${A},${B},${A},${B}`, `${A},bad`])("rejects invalid selection before any I/O (%s)", async (ids) => {
    const response = await handler({ method: "GET", query: { ids } });
    expect(response.status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.passport).not.toHaveBeenCalled();
  });
  it("rejects mutation requests without reading any row", async () => {
    expect((await handler({ method: "POST", query: { ids: A } })).status).toBe(405);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(["DRAFT", "PENDING_APPROVAL", "RESERVED", "REMOVED", "EXPIRED", "COMPLETED"])("never exposes %s listing data or loads its passport", async (status) => {
    database({ [A]: [{ data: { ...row(), status, title: "PRIVATE TITLE" } }] });
    expect(await getSmartphoneComparison(A)).toEqual([{ listing_id: A, availability: "unavailable", listing: null, passport: null, passport_error: false }]);
    expect(mocks.passport).not.toHaveBeenCalled();
  });
  it("preserves requested order and whitelists public fields", async () => {
    const a = { ...row(), owner_id: "PRIVATE OWNER", description: "PRIVATE DETAILS", geo_lat: 48.123456, internal_notes: "SECRET" };
    const b = row(B);
    const { queries } = database({ [A]: [{ data: a }, { data: a }], [B]: [{ data: b }, { data: b }] });
    const response = await handler({ method: "GET", query: { ids: `${B},${A}` } });
    expect(response.status).toBe(200);
    expect((response.body as any).data.items.map((item: any) => item.listing_id)).toEqual([B, A]);
    expect(response.headers["Cache-Control"]).toBe("private, no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|SECRET|geo_lat|owner_id/);
    expect(queries.filter((query) => query.table === "listings").every((query) => query.filters.status === "LIVE")).toBe(true);
    expect(queries.every((query) => !/owner_id|geo|description/.test(query.columns))).toBe(true);
  });
  it("rechecks LIVE after passport loading and drops all details if withdrawn meanwhile", async () => {
    database({ [A]: [{ data: row() }, { data: { ...row(), status: "REMOVED", title: "REMOVED TITLE" } }] });
    mocks.passport.mockResolvedValue({ listing_id: A, model: "PRIVATE PASSPORT" });
    const items = await getSmartphoneComparison(A);
    expect(items[0]).toMatchObject({ availability: "unavailable", listing: null, passport: null });
    expect(JSON.stringify(items)).not.toContain("PRIVATE PASSPORT");
  });
  it("does not read or expose a LIVE listing hidden by moderation", async () => {
    const { queries } = database({ [A]: [{ data: row() }], [`moderation:${A}`]: [{ data: { entity_id: A } }] });
    expect((await getSmartphoneComparison(A))[0]).toMatchObject({ availability: "unavailable", listing: null, passport: null });
    expect(mocks.passport).not.toHaveBeenCalled();
    expect(queries.find((query) => query.table === "moderation_states")?.filters).toEqual({ entity_type: "listing", entity_id: A, hidden: true });
  });
  it("drops a listing moderated while its passport is loading", async () => {
    database({ [A]: [{ data: row() }, { data: row() }], [`moderation:${A}`]: [{ data: null }, { data: { entity_id: A } }] });
    mocks.passport.mockResolvedValue({ listing_id: A, model: "MODERATED PASSPORT" });
    const items = await getSmartphoneComparison(A);
    expect(items[0]).toMatchObject({ availability: "unavailable", listing: null, passport: null });
    expect(JSON.stringify(items)).not.toContain("MODERATED PASSPORT");
  });
  it.each([true, false])("fails closed when moderation visibility cannot be checked (first=%s)", async (first) => {
    database({ [A]: [{ data: row() }, { data: row() }], [`moderation:${A}`]: first ? [{ error: { message: "PRIVATE moderation error" } }] : [{ data: null }, { error: { message: "PRIVATE moderation error" } }] });
    const items = await getSmartphoneComparison(A);
    expect(items[0]).toMatchObject({ availability: "error", listing: null, passport: null });
    expect(JSON.stringify(items)).not.toContain("PRIVATE moderation error");
  });
  it.each(["moderation", "withdrawal"])("rechecks all listings after a slow peer passport finishes (%s)", async (change) => {
    let changed = false;
    let releasePeer!: () => void;
    const peer = new Promise<null>((resolve) => { releasePeer = () => resolve(null); });
    database({
      [A]: [{ data: row() }, () => ({ data: { ...row(), title: "HIDDEN TITLE", status: changed && change === "withdrawal" ? "REMOVED" : "LIVE" } })],
      [B]: [{ data: row(B) }, { data: row(B) }],
      [`moderation:${A}`]: [{ data: null }, () => ({ data: changed && change === "moderation" ? { entity_id: A } : null })]
    });
    mocks.passport.mockImplementation(async (id) => id === B ? peer : { listing_id: A, model: "HIDDEN PASSPORT", checks: [{ notes: "HIDDEN NOTES" }] });
    const comparison = getSmartphoneComparison(`${A},${B}`);
    // Drain every resolved read while B remains pending, then change A before
    // releasing B. This exposes per-item checks performed before the batch ends.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mocks.passport).toHaveBeenCalledTimes(2);
    changed = true;
    releasePeer();
    const items = await comparison;
    expect(items[0]).toMatchObject({ availability: "unavailable", listing: null, passport: null });
    expect(items[1].availability).toBe("available");
    expect(JSON.stringify(items)).not.toMatch(/HIDDEN/);
  });
  it("uses the latest price after passport I/O instead of a stale first read", async () => {
    database({ [A]: [{ data: row() }, { data: { ...row(), price_amount: 31000 } }] });
    expect((await getSmartphoneComparison(A))[0].listing?.price.amount).toBe(31000);
  });
  it("separates a missing passport from a passport service failure", async () => {
    database({ [A]: [{ data: row() }, { data: row() }], [B]: [{ data: row(B) }, { data: row(B) }] });
    mocks.passport.mockImplementation(async (id) => { if (id === B) throw new Error("PRIVATE SQL ERROR"); return null; });
    const items = await getSmartphoneComparison(`${A},${B}`);
    expect(items[0]).toMatchObject({ availability: "available", passport: null, passport_error: false });
    expect(items[1]).toMatchObject({ availability: "available", passport: null, passport_error: true });
    expect(JSON.stringify(items)).not.toContain("PRIVATE SQL ERROR");
  });
  it("keeps a database error local to its item without exposing raw errors", async () => {
    database({ [A]: [{ error: { message: "password=secret TABLE owners" } }], [B]: [{ data: row(B) }, { data: row(B) }] });
    const items = await getSmartphoneComparison(`${A},${B}`);
    expect(items[0]).toMatchObject({ availability: "error", listing: null, passport: null });
    expect(items[1].availability).toBe("available");
    expect(JSON.stringify(items)).not.toMatch(/secret|owners/);
  });
  it("fails closed if the final listing visibility check fails", async () => {
    database({ [A]: [{ data: row() }, { error: { message: "PRIVATE SQL ERROR" } }] });
    expect((await getSmartphoneComparison(A))[0]).toMatchObject({ availability: "error", listing: null, passport: null });
  });
  it("recognizes an explicit passport without a smartphone title but rejects other categories", async () => {
    const generic = { ...row(), title: "My device", category: "electronics" };
    database({ [A]: [{ data: generic }, { data: generic }], [B]: [{ data: { ...row(B), title: "Chair", category: "furniture" } }, { data: { ...row(B), title: "Chair", category: "furniture" } }] });
    mocks.passport.mockImplementation(async (id) => id === A ? { listing_id: A, model: "Phone" } : null);
    const items = await getSmartphoneComparison(`${A},${B}`);
    expect(items[0].availability).toBe("available");
    expect(items[1]).toMatchObject({ availability: "unsupported", listing: null, passport: null });
  });
});
