import { describe, expect, it } from "vitest";

import { runObservabilityAlerts } from "../../server/observability/alerts";

type Call = { method: string; args: any[] };

class FakeQuery {
  table: string;
  calls: Call[] = [];
  private client: FakeSupabaseClient;

  constructor(table: string, client: FakeSupabaseClient) {
    this.table = table;
    this.client = client;
  }

  select(...args: any[]) {
    this.calls.push({ method: "select", args });
    return this;
  }

  gte(...args: any[]) {
    this.calls.push({ method: "gte", args });
    return this;
  }

  lt(...args: any[]) {
    this.calls.push({ method: "lt", args });
    return this;
  }

  like(...args: any[]) {
    this.calls.push({ method: "like", args });
    return this;
  }

  in(...args: any[]) {
    this.calls.push({ method: "in", args });
    return this;
  }

  eq(...args: any[]) {
    this.calls.push({ method: "eq", args });
    return this;
  }

  not(...args: any[]) {
    this.calls.push({ method: "not", args });
    return this;
  }

  order(...args: any[]) {
    this.calls.push({ method: "order", args });
    return this;
  }

  limit(...args: any[]) {
    this.calls.push({ method: "limit", args });
    return this;
  }

  then(onFulfilled: any, onRejected: any) {
    return Promise.resolve(this.client.execute(this)).then(onFulfilled, onRejected);
  }
}

class FakeSupabaseClient {
  fastFromIso: string;
  slowFromIso: string;
  queries: FakeQuery[] = [];

  constructor({ fastFromIso, slowFromIso }: { fastFromIso: string; slowFromIso: string }) {
    this.fastFromIso = fastFromIso;
    this.slowFromIso = slowFromIso;
  }

  from(table: string) {
    const q = new FakeQuery(table, this);
    this.queries.push(q);
    return q;
  }

  execute(query: FakeQuery): any {
    const getCall = (method: string, col?: string) =>
      query.calls.find((c) => c.method === method && (col ? c.args?.[0] === col : true));

    const fromIso = getCall("gte", "occurred_at")?.args?.[1];
    const isFast = fromIso === this.fastFromIso;
    const isSlow = fromIso === this.slowFromIso;

    const selectOpts = getCall("select")?.args?.[1];
    const isCountQuery = !!selectOpts?.head;

    if (query.table === "audit_logs") {
      if (!isCountQuery) {
        return { data: [], error: null };
      }

      const isEventsQuery = !!getCall("in", "action->>event");
      if (isEventsQuery) {
        // Keep totals below min-request thresholds so burn-rate alerts aren't triggered in this unit test.
        const count = isFast ? 10 : 99;
        return { count, error: null };
      }

      const isPathLikeQuery = !!getCall("like", "action->>path");
      if (isPathLikeQuery) {
        const has5xxRange =
          !!getCall("gte", "request->>status_code") && !!getCall("lt", "request->>status_code");
        if (has5xxRange) {
          return { count: isFast ? 10 : 40, error: null };
        }

        const has429Eq = getCall("eq", "request->>status_code")?.args?.[1] === "429";
        if (has429Eq) {
          return { count: isFast ? 5 : 20, error: null };
        }

        const requiresStatusCode = query.calls.some(
          (c) => c.method === "not" && c.args?.[0] === "request->>status_code" && c.args?.[1] === "is" && c.args?.[2] === null
        );

        // Model the bug: without an explicit NOT NULL filter, totals include pre-instrumentation rows.
        if (requiresStatusCode) {
          return { count: isFast ? 80 : 800, error: null };
        }
        return { count: isFast ? 100 : 1000, error: null };
      }

      return { count: 0, error: null };
    }

    if (query.table === "approvals") {
      if (isCountQuery) return { count: 0, error: null };
      return { data: [], error: null };
    }

    if (query.table === "trustscore_recalc_queue" || query.table === "watchlist_backfill_queue") {
      if (isCountQuery) return { count: 0, error: null };
      return { data: [], error: null };
    }

    return isCountQuery ? { count: 0, error: null } : { data: [], error: null };
  }
}

describe("runObservabilityAlerts()", () => {
  it("excludes audit rows missing request.status_code from API error-rate totals", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const fastWindowSeconds = 5 * 60;
    const slowWindowSeconds = 60 * 60;
    const fastFromIso = new Date(now.getTime() - fastWindowSeconds * 1000).toISOString();
    const slowFromIso = new Date(now.getTime() - slowWindowSeconds * 1000).toISOString();

    const client = new FakeSupabaseClient({ fastFromIso, slowFromIso });
    const env = {
      SUPABASE_URL: "http://example.test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      ALERTING_FAST_WINDOW_SECONDS: String(fastWindowSeconds),
      ALERTING_SLOW_WINDOW_SECONDS: String(slowWindowSeconds)
    };

    const result: any = await runObservabilityAlerts({ env, now, client });

    expect(result.anomalies["5xx_spike"].fast.total).toBe(80);
    expect(result.anomalies["5xx_spike"].fast.rate).toBeCloseTo(10 / 80, 10);

    const hasNotNullStatusCodeFilter = client.queries.some((q) => {
      if (q.table !== "audit_logs") return false;
      const isTotalQuery =
        q.calls.some((c) => c.method === "like" && c.args?.[0] === "action->>path") &&
        !q.calls.some((c) => ["eq", "gte", "lt"].includes(c.method) && c.args?.[0] === "request->>status_code");
      if (!isTotalQuery) return false;
      return q.calls.some(
        (c) => c.method === "not" && c.args?.[0] === "request->>status_code" && c.args?.[1] === "is" && c.args?.[2] === null
      );
    });

    expect(hasNotNullStatusCodeFilter).toBe(true);
  });
});

