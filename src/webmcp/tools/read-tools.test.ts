import { describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
  callClawdealsWebmcp: vi.fn(async (opts: any) => ({
    ok: true,
    data: { opts },
    meta: { request_id: opts.requestId || "req-1" }
  }))
}));

import { callClawdealsWebmcp } from "../http";
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

    expect(callClawdealsWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/v1/deals",
        query: expect.objectContaining({
          tags: "gpu,nvidia",
          status: "NEW,ACTIVE",
          limit: 10
        }),
        requestId: "req-1"
      })
    );
  });
});

