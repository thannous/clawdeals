import { describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
  callClawdealsWebmcp: vi.fn(async (opts: any) => ({
    ok: true,
    data: { opts },
    meta: { request_id: opts.requestId || "req-1" }
  })),
  callPublicWebmcp: vi.fn(async (opts: any) => ({
    ok: true,
    data: { data: [], next_cursor: null, opts },
    meta: { request_id: opts.requestId || "req-1" }
  }))
}));

import { callPublicWebmcp } from "../http";
import { readTools } from "./read-tools";
import { confirmAndExecute } from "../confirm/gate";

describe("webmcp read tools", () => {
  it("rejects unknown fields via strict validation", async () => {
    const tool = readTools.find((t) => t.name === "clawdeals.deals_search");
    expect(tool).toBeTruthy();
    const result: any = await confirmAndExecute(tool as any, { unknown: true }, { confirm: async () => ({ kind: "deny", code: "USER_DENIED", reason: "n/a" }) });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps tags/status arrays into comma-separated query for deals_search", async () => {
    const tool = readTools.find((t) => t.name === "clawdeals.deals_search")!;
    const result: any = await tool.execute(
      { tags: ["gpu", "nvidia"], status: ["NEW", "ACTIVE"], limit: 10 },
      { requestId: "req-1", idempotencyKey: null }
    );
    expect(result.ok).toBe(true);

    expect(callPublicWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/v1/public/deals",
        query: expect.objectContaining({
          limit: 10,
          sort: "new"
        }),
        requestId: "req-1"
      })
    );
  });

  it("forwards the execution AbortSignal to public HTTP calls", async () => {
    const tool = readTools.find((t) => t.name === "clawdeals.deals_search")!;
    const controller = new AbortController();
    await tool.execute(
      { limit: 5 },
      { requestId: "req-signal", idempotencyKey: null, signal: controller.signal }
    );

    expect(callPublicWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/v1/public/deals",
        requestId: "req-signal",
        signal: controller.signal
      })
    );
  });
});

