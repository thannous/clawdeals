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

  it("forwards the invocation signal into the tool execution context", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async (_args: any, ctx: any) => {
      return { ok: true, data: { hasSignal: ctx.signal === controller.signal }, meta: { request_id: ctx.requestId } };
    });

    const tool: any = {
      name: "tool.read",
      description: "read tool",
      scope: "read",
      requiresConfirmation: false,
      inputJsonSchema: {},
      zodSchema: z.object({ a: z.string() }).strict(),
      outputHint: "hint",
      execute
    };

    const result: any = await confirmAndExecute(tool, { a: "x" }, {
      confirm: async () => ({ kind: "deny", code: "USER_DENIED", reason: "unused" }),
      requestId: "req-signal",
      signal: controller.signal
    });

    expect(result.ok).toBe(true);
    expect(result.data.hasSignal).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
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

