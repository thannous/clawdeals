import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------
const mockFrom = vi.fn();
const mockClient = { from: mockFrom };

vi.mock("../../server/db/supabase", () => ({
  getSupabaseServiceClient: () => mockClient
}));

vi.mock("../../server/services/supabase-errors", () => ({
  mapSupabaseError: (err: any) => ({
    message: err.message || "DB error",
    status: err.status || 500,
    code: err.code || "DB_ERROR"
  })
}));

import { getConsoleOpsDashboard } from "../../server/services/console-ops-dashboard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock that mimics the Supabase query builder.
 * Methods return `this` so they can be chained indefinitely.
 * The chain is also a thenable — awaiting it resolves with `{ data, error }`.
 */
function supabaseChain(resolvedData: any = [], resolvedError: any = null) {
  const chain: any = {};
  const methods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "is",
    "not",
    "in",
    "or",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle"
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain thenable so `await query` resolves with { data, error, count }.
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: resolvedData, error: resolvedError, count: resolvedData?.length ?? 0 }).then(
      resolve,
      reject
    );
  return chain;
}

/** Convenience: build a chain that resolves with head-only count (for `countRows`). */
function countChain(count: number) {
  const chain: any = {};
  const methods = ["select", "eq", "is", "not", "in", "or", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: null, error: null, count }).then(resolve, reject);
  return chain;
}

/**
 * Build a minimal audit row for SLI events.
 *
 * @param event  - e.g. "deal.create"
 * @param statusCode - HTTP status code
 * @param occurredAt - ISO timestamp
 * @param durationMs - optional duration_ms
 */
function auditRow(
  event: string,
  statusCode: number,
  occurredAt: string,
  durationMs?: number
) {
  const isSuccess = statusCode >= 200 && statusCode < 400;
  return {
    id: crypto.randomUUID(),
    occurred_at: occurredAt,
    outcome: isSuccess ? "SUCCESS" : "FAILURE",
    action: { event, route_group: "deals" },
    request: {
      status_code: statusCode,
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {})
    },
    auth: { agent_id: "agent-1" }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("getConsoleOpsDashboard() — SLI / SLO fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. computeBudgetState — tested indirectly via aggregate.budget_state
  // =========================================================================
  describe("budget_state (indirect via aggregate)", () => {
    /**
     * Helper: inject audit rows where all SLI events have a specific success rate
     * and return the dashboard result.
     *
     * @param successCount - number of 2xx rows
     * @param failCount    - number of 5xx rows
     */
    async function dashboardWithSliRate(successCount: number, failCount: number) {
      const now = new Date("2026-02-11T12:00:00.000Z");
      const ts = "2026-02-11T11:30:00.000Z"; // within the default 60-min window

      const rows: any[] = [];
      for (let i = 0; i < successCount; i++) {
        rows.push(auditRow("deal.create", 200, ts, 50));
      }
      for (let i = 0; i < failCount; i++) {
        rows.push(auditRow("deal.create", 500, ts, 50));
      }

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain(rows);
        if (table === "approvals") {
          // countRows uses head:true — return via count property
          // fetchOldestPendingApproval uses select + order + limit → data array
          // fetchResolvedApprovals uses select + not + gte + lt + order + limit → data array
          return supabaseChain([], null);
        }
        // trustscore_recalc_queue, watchlist_backfill_queue
        return countChain(0);
      });

      return getConsoleOpsDashboard({ windowMinutes: 60, now, client: mockClient });
    }

    it("returns GREEN when success_rate=0.995 (budget remaining > 50%)", async () => {
      // 995 success, 5 fail → rate = 0.995
      // error_budget = 1 - 0.99 = 0.01
      // used = 0.005, remaining% = 1 - 0.005/0.01 = 0.5 → exactly 50%, so >= 0.5 → GREEN
      const result = await dashboardWithSliRate(995, 5);
      expect(result.sli.write_journeys.aggregate.budget_state).toBe("GREEN");
    });

    it("returns YELLOW when success_rate=0.993 (budget remaining 25-50%)", async () => {
      // 993 success, 7 fail → rate = 0.993
      // used = 0.007, remaining% = 1 - 0.007/0.01 = 0.3 → 25-50% → YELLOW
      const result = await dashboardWithSliRate(993, 7);
      expect(result.sli.write_journeys.aggregate.budget_state).toBe("YELLOW");
    });

    it("returns GREEN when success_rate=0.998 (budget remaining > 50%)", async () => {
      // 998 success, 2 fail → rate = 0.998
      // used = 0.002, remaining% = 1 - 0.002/0.01 = 0.8 → GREEN
      const result = await dashboardWithSliRate(998, 2);
      expect(result.sli.write_journeys.aggregate.budget_state).toBe("GREEN");
    });

    it("returns RED when success_rate is very low (budget remaining < 25%)", async () => {
      // 980 success, 20 fail → rate = 0.98
      // used = 0.02, remaining% = 1 - 0.02/0.01 = -1 → clamped to 0 → EXHAUSTED
      // Actually remaining% = max(0, 1 - 0.02/0.01) = max(0, -1) = 0 → EXHAUSTED
      // Let's use a rate where remaining is between 0 and 0.25:
      // rate = 0.9925 → used = 0.0075, remaining% = 1 - 0.0075/0.01 = 0.25 → exactly 0.25
      // That's still < 0.25 boundary (it checks < 0.25 not <=), so need just under:
      // rate ~ 0.9924 → used = 0.0076, remaining = 1 - 0.76 = 0.24 → RED
      // Use 9924 success, 76 fail = 10000 total → rate = 0.9924
      const result = await dashboardWithSliRate(9924, 76);
      expect(result.sli.write_journeys.aggregate.budget_state).toBe("RED");
    });

    it("returns EXHAUSTED when success_rate=0.0 (budget exhausted)", async () => {
      // 0 success, 100 fail → rate = 0.0
      const result = await dashboardWithSliRate(0, 100);
      expect(result.sli.write_journeys.aggregate.budget_state).toBe("EXHAUSTED");
    });

    it("returns GREEN when no SLI events exist (null success_rate)", async () => {
      // 0 success, 0 fail → total = 0 → rate = null → GREEN
      const result = await dashboardWithSliRate(0, 0);
      expect(result.sli.write_journeys.aggregate.budget_state).toBe("GREEN");
      expect(result.sli.write_journeys.aggregate.success_rate).toBeNull();
    });
  });

  // =========================================================================
  // 2. Full shape: by_event, aggregate, burn_rate, approvals_detail, slo_latency_targets
  // =========================================================================
  describe("full response shape with mock data", () => {
    it("returns sli.write_journeys.by_event with correct counts", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");
      const ts = "2026-02-11T11:30:00.000Z";

      const rows = [
        auditRow("deal.create", 200, ts, 80),
        auditRow("deal.create", 200, ts, 90),
        auditRow("deal.create", 500, ts, 200),
        auditRow("listing.create", 201, ts, 100),
        auditRow("listing.create", 200, ts, 110),
        auditRow("offer.create", 200, ts, 60),
        // Non-SLI event — should not appear in by_event
        auditRow("agent.key_rotated", 200, ts, 10)
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain(rows);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      // --- sli.write_journeys.events ---
      expect(result.sli.write_journeys.events).toEqual([
        "deal.create",
        "listing.create",
        "offer.create"
      ]);

      // --- sli.write_journeys.by_event ---
      const byEvent = result.sli.write_journeys.by_event;
      expect(Array.isArray(byEvent)).toBe(true);
      expect(byEvent).toHaveLength(3);

      const dealEntry = byEvent.find((e: any) => e.event === "deal.create");
      expect(dealEntry).toBeDefined();
      expect(dealEntry.total).toBe(3);
      expect(dealEntry.success).toBe(2);
      expect(dealEntry.success_rate).toBeCloseTo(2 / 3, 5);

      const listingEntry = byEvent.find((e: any) => e.event === "listing.create");
      expect(listingEntry).toBeDefined();
      expect(listingEntry.total).toBe(2);
      expect(listingEntry.success).toBe(2);
      expect(listingEntry.success_rate).toBe(1);

      const offerEntry = byEvent.find((e: any) => e.event === "offer.create");
      expect(offerEntry).toBeDefined();
      expect(offerEntry.total).toBe(1);
      expect(offerEntry.success).toBe(1);
      expect(offerEntry.success_rate).toBe(1);
    });

    it("returns sli.write_journeys.aggregate with budget_state computed", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");
      const ts = "2026-02-11T11:30:00.000Z";

      // 5 success + 1 fail = rate ~0.833 → EXHAUSTED (way below 0.99 SLO)
      const rows = [
        auditRow("deal.create", 200, ts),
        auditRow("deal.create", 200, ts),
        auditRow("deal.create", 200, ts),
        auditRow("listing.create", 200, ts),
        auditRow("offer.create", 200, ts),
        auditRow("offer.create", 500, ts)
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain(rows);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      const agg = result.sli.write_journeys.aggregate;
      expect(agg.total).toBe(6);
      expect(agg.success).toBe(5);
      expect(agg.success_rate).toBeCloseTo(5 / 6, 5);
      expect(agg.slo_target).toBe(0.99);
      expect(typeof agg.error_budget_remaining_pct).toBe("number");
      expect(["GREEN", "YELLOW", "RED", "EXHAUSTED"]).toContain(agg.budget_state);
      // With rate ~0.833, budget is exhausted
      expect(agg.budget_state).toBe("EXHAUSTED");
    });

    it("returns burn_rate with fast and slow windows", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");
      // Row within fast window (< 5 min ago)
      const tsFast = "2026-02-11T11:57:00.000Z";
      // Row within slow window (< 1 hr ago) but outside fast window
      const tsSlow = "2026-02-11T11:15:00.000Z";

      const rows = [
        auditRow("deal.create", 200, tsFast),
        auditRow("deal.create", 500, tsFast),
        auditRow("listing.create", 200, tsSlow),
        auditRow("listing.create", 200, tsSlow)
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain(rows);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      const burnRate = result.sli.write_journeys.burn_rate;
      expect(burnRate.fast.window_s).toBe(300);
      expect(burnRate.slow.window_s).toBe(3600);
      // Fast window: 1 good + 1 bad = badRate 0.5 → burn = 0.5 / 0.01 = 50
      expect(typeof burnRate.fast.value).toBe("number");
      expect(burnRate.fast.value).toBe(50);
      // Slow window: all 4 rows → 3 good, 1 bad → badRate 0.25 → burn = 0.25 / 0.01 = 25
      expect(typeof burnRate.slow.value).toBe("number");
      expect(burnRate.slow.value).toBe(25);
    });

    it("returns null burn_rate values when no SLI events in window", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");

      // Only non-SLI events
      const rows = [
        auditRow("agent.key_rotated", 200, "2026-02-11T11:58:00.000Z")
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain(rows);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      expect(result.sli.write_journeys.burn_rate.fast.value).toBeNull();
      expect(result.sli.write_journeys.burn_rate.slow.value).toBeNull();
    });

    it("returns approvals_detail with resolve time percentiles", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");
      const ts = "2026-02-11T11:30:00.000Z";

      const auditRows = [auditRow("deal.create", 200, ts)];

      // Resolved approvals — created_at → resolved_at durations (in seconds):
      // 600s (10 min), 1200s (20 min), 1800s (30 min), 3600s (1 hr), 7200s (2 hr)
      const resolvedApprovals = [
        { created_at: "2026-02-11T10:00:00.000Z", resolved_at: "2026-02-11T10:10:00.000Z" }, // 600s
        { created_at: "2026-02-11T10:00:00.000Z", resolved_at: "2026-02-11T10:20:00.000Z" }, // 1200s
        { created_at: "2026-02-11T10:00:00.000Z", resolved_at: "2026-02-11T10:30:00.000Z" }, // 1800s
        { created_at: "2026-02-11T10:00:00.000Z", resolved_at: "2026-02-11T11:00:00.000Z" }, // 3600s
        { created_at: "2026-02-11T10:00:00.000Z", resolved_at: "2026-02-11T12:00:00.000Z" }  // 7200s
      ];

      // Oldest pending approval — 2 hours ago
      const oldestPending = [{ created_at: "2026-02-11T10:00:00.000Z" }];

      let approvalCallIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain(auditRows);
        if (table === "approvals") {
          approvalCallIndex++;
          // Call 1: countRows (head: true) — pending count
          if (approvalCallIndex === 1) return countChain(5);
          // Call 2: fetchOldestPendingApproval — select + eq + order + limit
          if (approvalCallIndex === 2) return supabaseChain(oldestPending);
          // Call 3: fetchResolvedApprovals — select + not + gte + lt + order + limit
          if (approvalCallIndex === 3) return supabaseChain(resolvedApprovals);
          return supabaseChain([]);
        }
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      const detail = result.approvals_detail;
      expect(detail.pending_count).toBe(5);
      expect(detail.oldest_pending_age_s).toBeGreaterThanOrEqual(0);
      expect(typeof detail.oldest_pending_created_at).toBe("string");

      // Resolved window
      expect(detail.resolved_window.count).toBe(5);
      expect(typeof detail.resolved_window.p50_resolve_s).toBe("number");
      expect(typeof detail.resolved_window.p95_resolve_s).toBe("number");
      // p50 of [600, 1200, 1800, 3600, 7200] → median is 1800
      expect(detail.resolved_window.p50_resolve_s).toBe(1800);
      // p95 → near 7200
      expect(detail.resolved_window.p95_resolve_s).toBeGreaterThanOrEqual(3600);
    });

    it("returns null oldest_pending fields when no pending approvals", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain([]);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      expect(result.approvals_detail.oldest_pending_age_s).toBeNull();
      expect(result.approvals_detail.oldest_pending_created_at).toBeNull();
    });

    it("returns null resolve percentiles when no resolved approvals", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain([]);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      expect(result.approvals_detail.resolved_window.count).toBe(0);
      expect(result.approvals_detail.resolved_window.p50_resolve_s).toBeNull();
      expect(result.approvals_detail.resolved_window.p95_resolve_s).toBeNull();
    });

    it("returns slo_latency_targets with expected keys", async () => {
      const now = new Date("2026-02-11T12:00:00.000Z");

      mockFrom.mockImplementation((table: string) => {
        if (table === "audit_logs") return supabaseChain([]);
        if (table === "approvals") return supabaseChain([], null);
        return countChain(0);
      });

      const result = await getConsoleOpsDashboard({
        windowMinutes: 60,
        now,
        client: mockClient
      });

      expect(result.slo_latency_targets).toBeDefined();
      expect(typeof result.slo_latency_targets).toBe("object");
      expect(result.slo_latency_targets["deal.create"]).toBe(1000);
      expect(result.slo_latency_targets["listing.create"]).toBe(1200);
      expect(result.slo_latency_targets["offer.create"]).toBe(1200);
    });
  });
});
