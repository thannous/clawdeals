import { describe, expect, it, vi } from "vitest";

import { runTrustScoreRecalcQueue } from "./recalc-queue";

type QueueRow = {
  agent_id: string;
  updated_at: string | null;
  last_reason?: string | null;
};

class FakeSupabaseClient {
  _queue: QueueRow[];

  constructor(rows: QueueRow[]) {
    // store mutable state to simulate concurrent updates
    this._queue = rows;
  }

  upsertQueueRow(next: QueueRow) {
    const idx = this._queue.findIndex((r) => r.agent_id === next.agent_id);
    if (idx >= 0) this._queue[idx] = { ...this._queue[idx], ...next };
    else this._queue.push(next);
  }

  from(table: string) {
    if (table !== "trustscore_recalc_queue") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return new FakeQueueQuery(this);
  }
}

class FakeQueueQuery {
  client: FakeSupabaseClient;
  op: "select" | "delete" | null = null;
  filters: Array<{ column: string; value: any }> = [];
  _limit: number | null = null;

  constructor(client: FakeSupabaseClient) {
    this.client = client;
  }

  select(_columns: string) {
    this.op = "select";
    return this;
  }

  order(_column: string, _opts?: any) {
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this._execute().then(onfulfilled, onrejected);
  }

  private async _execute() {
    if (this.op === "select") {
      const sorted = [...this.client._queue].sort((a, b) => {
        const ua = a.updated_at || "";
        const ub = b.updated_at || "";
        if (ua < ub) return -1;
        if (ua > ub) return 1;
        return a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0;
      });

      const limited = typeof this._limit === "number" ? sorted.slice(0, this._limit) : sorted;

      // Return copies so later mutations simulate true concurrency.
      return { data: limited.map((r) => ({ ...r })), error: null };
    }

    if (this.op === "delete") {
      const matches = (row: QueueRow) => this.filters.every((f) => (row as any)[f.column] === f.value);
      this.client._queue = this.client._queue.filter((row) => !matches(row));
      return { data: null, error: null };
    }

    return { data: null, error: new Error("No operation specified") };
  }
}

describe("runTrustScoreRecalcQueue", () => {
  it("does not drop a queue row that was re-enqueued while processing (updated_at guard)", async () => {
    const t1 = "2026-02-08T00:00:00.000Z";
    const t2 = "2026-02-08T00:00:10.000Z";
    const client = new FakeSupabaseClient([{ agent_id: "a1", updated_at: t1, last_reason: "initial" }]);

    const recalculate = vi.fn(async ({ agentId }: { agentId: string }) => {
      // Simulate a concurrent enqueue/upsert that bumps updated_at.
      client.upsertQueueRow({ agent_id: agentId, updated_at: t2, last_reason: "concurrent" });
      return { ok: true, updated: true };
    });

    const summary = await runTrustScoreRecalcQueue({
      client,
      recalculate,
      limit: 10,
      now: new Date("2026-02-08T00:00:20.000Z")
    });

    expect(summary.updated).toBe(1);
    expect(client._queue).toHaveLength(1);
    expect(client._queue[0].agent_id).toBe("a1");
    expect(client._queue[0].updated_at).toBe(t2);
  });

  it("deletes the queue row when updated_at is unchanged", async () => {
    const t1 = "2026-02-08T00:00:00.000Z";
    const client = new FakeSupabaseClient([{ agent_id: "a1", updated_at: t1, last_reason: null }]);

    const recalculate = vi.fn(async () => ({ ok: true, updated: false }));

    const summary = await runTrustScoreRecalcQueue({
      client,
      recalculate,
      limit: 10,
      now: new Date("2026-02-08T00:00:20.000Z")
    });

    expect(summary.skipped).toBe(1);
    expect(client._queue).toHaveLength(0);
  });
});

