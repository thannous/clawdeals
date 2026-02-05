import { describe, expect, it } from "vitest";
import { buildStateChanges } from "./deal-lifecycle";

describe("deal lifecycle state changes", () => {
  it("builds ACTIVE transitions", () => {
    const updated = [{ deal_id: "deal-1" }, { deal_id: "deal-2" }];
    const previous = new Map([
      ["deal-1", "NEW"],
      ["deal-2", "NEW"]
    ]);
    const nowIso = "2026-02-05T12:00:00Z";
    const changes = buildStateChanges(updated, previous, "ACTIVE", nowIso, "active_at");
    expect(changes).toEqual([
      {
        deal_id: "deal-1",
        previous_status: "NEW",
        status: "ACTIVE",
        active_at: nowIso
      },
      {
        deal_id: "deal-2",
        previous_status: "NEW",
        status: "ACTIVE",
        active_at: nowIso
      }
    ]);
  });

  it("builds EXPIRED transitions with previous status", () => {
    const updated = [{ deal_id: "deal-3" }];
    const previous = new Map([["deal-3", "ACTIVE"]]);
    const nowIso = "2026-02-05T13:00:00Z";
    const changes = buildStateChanges(updated, previous, "EXPIRED", nowIso, "expired_at");
    expect(changes).toEqual([
      {
        deal_id: "deal-3",
        previous_status: "ACTIVE",
        status: "EXPIRED",
        expired_at: nowIso
      }
    ]);
  });
});
