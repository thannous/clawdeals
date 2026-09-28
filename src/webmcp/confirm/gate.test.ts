import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { confirmAndExecute } from "./gate";

describe("webmcp confirm gate", () => {
  it("returns ABORTED before confirmation when the signal is already aborted", async () => {
    const execute = vi.fn(async () => ({ ok: true, data: { ok: true }, meta: { request_id: "req-1" } }));
    const confirm = vi.fn(async (): Promise<{ kind: "approve"; args: { a: string } }> => ({ kind: "approve", args: { a: "x" } }));
    const controller = new AbortController();
    controller.abort();

    const tool: any = {
      name: "tool.write",
      description: "write tool",
      scope: "write",
      requiresConfirmation: true,
      inputJsonSchema: {},
      zodSchema: z.object({ a: z.string() }).strict(),
      outputHint: "hint",
      execute
    };

    const result: any = await confirmAndExecute(tool, { a: "x" }, {
      confirm,
      requestId: "req-aborted",
      signal: controller.signal
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "ABORTED", message: "Cancelled", details: {} },
      meta: { request_id: "req-aborted" }
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns ABORTED after approval if the signal aborted during confirmation", async () => {
    const execute = vi.fn(async () => ({ ok: true, data: { ok: true }, meta: { request_id: "req-1" } }));
    const controller = new AbortController();

    const tool: any = {
      name: "tool.write",
      description: "write tool",
      scope: "write",
      requiresConfirmation: true,
      inputJsonSchema: {},
      zodSchema: z.object({ a: z.string() }).strict(),
      outputHint: "hint",
      execute
    };

    const result: any = await confirmAndExecute(tool, { a: "x" }, {
      confirm: async () => {
        controller.abort();
        return { kind: "approve", args: { a: "edited" } };
      },
      requestId: "req-after-confirm",
      signal: controller.signal
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "ABORTED", message: "Cancelled", details: {} },
      meta: { request_id: "req-after-confirm" }
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
