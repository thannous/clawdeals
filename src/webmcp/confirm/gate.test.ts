import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { confirmAndExecute } from "./gate";

describe("webmcp confirm gate", () => {
  it("returns USER_DENIED when user denies", async () => {
    const execute = vi.fn(async () => ({ ok: true, data: { ok: true }, meta: { request_id: "req-1" } }));

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

    const result: any = await confirmAndExecute(tool, { a: "x" }, { confirm: async () => ({ kind: "deny", code: "USER_DENIED", reason: "nope" }) });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("USER_DENIED");
    expect(result.error.details.reason).toBe("nope");
    expect(execute).not.toHaveBeenCalled();
  });

  it("approves with edited args and injects idempotency key", async () => {
    const execute = vi.fn(async (_args: any, ctx: any) => {
      return { ok: true, data: { args: _args, idem: ctx.idempotencyKey }, meta: { request_id: ctx.requestId } };
    });

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

    const result: any = await confirmAndExecute(
      tool,
      { a: "x" },
      { confirm: async () => ({ kind: "approve", args: { a: "edited" } }), requestId: "req-1" }
    );

    expect(result.ok).toBe(true);
    expect(result.data.args.a).toBe("edited");
    expect(result.data.idem).toBeTruthy();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

