import { describe, expect, it } from "vitest";

import { markWatchlistMatchesDelivered } from "./watchlist-digest";

describe("watchlist digest", () => {
  it("chunks delivered_at updates to avoid oversized in(...) queries", async () => {
    const calls: string[][] = [];

    const client: any = {
      from() {
        return {
          update() {
            return {
              async in(_col: string, ids: string[]) {
                calls.push(ids);
                return { error: null };
              }
            };
          }
        };
      }
    };

    const matchIds = ["a", "b", "c", "d", "e", "f", "a"]; // includes duplicate
    const res = await markWatchlistMatchesDelivered({
      client,
      matchIds,
      deliveredAt: "2026-02-09T00:00:00Z",
      chunkSize: 2
    });

    expect(res).toEqual({ ok: true, updated: 6 });
    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e", "f"]]);
  });

  it("does not count failed chunks as delivered", async () => {
    const calls: string[][] = [];

    const client: any = {
      from() {
        return {
          update() {
            return {
              async in(_col: string, ids: string[]) {
                calls.push(ids);
                if (ids.includes("c")) {
                  return { error: { message: "fail" } };
                }
                return { error: null };
              }
            };
          }
        };
      }
    };

    const matchIds = ["a", "b", "c", "d"];
    const res = await markWatchlistMatchesDelivered({
      client,
      matchIds,
      deliveredAt: "2026-02-09T00:00:00Z",
      chunkSize: 2
    });

    expect(res).toEqual({ ok: true, updated: 2 });
    expect(calls).toEqual([["a", "b"], ["c", "d"]]);
  });
});

