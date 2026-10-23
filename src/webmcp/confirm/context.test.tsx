// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { WebMcpConfirmProvider, useWebMcpConfirm } from "./context";
import { confirmAndExecute } from "./gate";
import type { ConfirmDecision, ConfirmRequest } from "./types";
import type { ToolDef } from "../tools/defs";

let context: ReturnType<typeof useWebMcpConfirm>;
function Harness() {
  const value = useWebMcpConfirm();
  useEffect(() => { context = value; }, [value]);
  return value.pending ? <div role="dialog">{value.pending.toolName}</div> : null;
}

const request = (overrides: Partial<ConfirmRequest> = {}): ConfirmRequest => ({
  requestId: "request-1",
  toolName: "tool.write",
  toolDescription: "Test write",
  toolScope: "write",
  outputHint: "Result",
  args: { value: "original" },
  timeoutMs: 60_000,
  ...overrides
});
const denied = (reason: string): ConfirmDecision => ({ kind: "deny", code: "USER_DENIED", reason });

function makeTool(scope: "write" | "admin") {
  const execute = vi.fn(async (args: { value: string }) => ({
    ok: true as const, data: args, meta: { request_id: "executed" }
  }));
  const tool: ToolDef<{ value: string }, { value: string }> = {
    name: `tool.${scope}`, description: "Test write", scope, requiresConfirmation: true,
    inputJsonSchema: {}, zodSchema: z.object({ value: z.string() }).strict(), outputHint: "Result", execute
  };
  return { tool, execute };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("confirmation ownership", () => {
  it("retains a terminal path for every request after all deadlines expire", async () => {
    render(<WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider>);
    const settled: string[] = [];
    await act(async () => {
      void context.requestConfirmation(request({ requestId: "first", timeoutMs: 10 })).then(() => { settled.push("first"); });
      void context.requestConfirmation(request({ requestId: "second", timeoutMs: 20 })).then(() => { settled.push("second"); });
    });
    await act(async () => { vi.runAllTimers(); });
    expect(vi.getTimerCount()).toBe(0);
    expect(context.pending).toBeNull();
    expect(settled.sort()).toEqual(["first", "second"]);
  });

  // Browser journeys wait for the modal between calls, and existing provider
  // tests mock this context. Batch real requests to reproduce the lost resolver.
  it.each(["write", "admin"] as const)("settles competing %s calls and executes only the approved arguments", async (scope) => {
    render(<StrictMode><WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider></StrictMode>);
    const { tool, execute } = makeTool(scope);
    const results: Awaited<ReturnType<typeof confirmAndExecute>>[] = [];
    let first!: ReturnType<typeof confirmAndExecute>;
    let second!: ReturnType<typeof confirmAndExecute>;
    await act(async () => {
      const confirm = context.requestConfirmation;
      first = confirmAndExecute(tool, { value: "first" }, { confirm, requestId: "same-id" });
      second = confirmAndExecute(tool, { value: "second" }, { confirm, requestId: "same-id" });
      void second.then((result) => { results.push(result); });
    });
    expect(results).toEqual([{
      ok: false, error: { code: "USER_DENIED", message: "User denied tool execution",
        details: { reason: "another_confirmation_pending" } }, meta: { request_id: "same-id" }
    }]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(context.pending?.args).toEqual({ value: "first" });
    expect(execute).not.toHaveBeenCalled();
    await act(async () => { context.decide({ kind: "approve", args: { value: "edited" } }); });
    expect(await first).toMatchObject({ ok: true, data: { value: "edited" } });
    await second;
    expect(execute).toHaveBeenCalledExactlyOnceWith({ value: "edited" }, expect.any(Object));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(context.history).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the original timeout when another request competes", async () => {
    render(<WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider>);
    const decisions: ConfirmDecision[] = [];
    await act(async () => {
      void context.requestConfirmation(request({ timeoutMs: 10 })).then((decision) => { decisions.push(decision); });
      void context.requestConfirmation(request({ requestId: "other", timeoutMs: 100 })).then((decision) => { decisions.push(decision); });
    });
    expect(decisions).toEqual([denied("another_confirmation_pending")]);
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(decisions).toEqual([denied("another_confirmation_pending"), denied("timeout")]);
    expect(context.pending).toBeNull();
    expect(context.history).toMatchObject([{ requestId: "request-1", reason: "timeout" }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not apply stale or duplicate decisions to a replacement with the same request ID", async () => {
    render(<WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider>);
    await act(async () => { void context.requestConfirmation(request({ timeoutMs: 10 })); });
    const staleDecide = context.decide;
    const decisions: ConfirmDecision[] = [];
    await act(async () => {
      vi.advanceTimersByTime(10);
      void context.requestConfirmation(request()).then((decision) => { decisions.push(decision); });
      staleDecide({ kind: "approve", args: { value: "old" } });
    });
    expect(context.pending?.args).toEqual({ value: "original" });
    expect(decisions).toEqual([]);
    await act(async () => {
      context.decide(denied("user_denied"));
      context.decide({ kind: "approve", args: { value: "duplicate" } });
    });
    expect(decisions).toEqual([denied("user_denied")]);
    expect(context.history).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles cancellation through the gate and releases its modal and timeout", async () => {
    render(<WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider>);
    const { tool, execute } = makeTool("write");
    const controller = new AbortController();
    const results: Awaited<ReturnType<typeof confirmAndExecute>>[] = [];
    await act(async () => {
      void confirmAndExecute(tool, { value: "first" }, {
        confirm: context.requestConfirmation, signal: controller.signal, requestId: "cancelled"
      }).then((result) => { results.push(result); });
    });
    await act(async () => { controller.abort(); });
    expect(results).toEqual([{
      ok: false, error: { code: "USER_DENIED", message: "User denied tool execution", details: { reason: "aborted" } },
      meta: { request_id: "cancelled" }
    }]);
    expect(context.pending).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { void context.requestConfirmation(request()); });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await act(async () => { context.decide(denied("user_denied")); });
  });

  it("denies pending and retained callbacks on unmount without leaving timers", async () => {
    const view = render(<WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider>);
    const decisions: ConfirmDecision[] = [];
    await act(async () => {
      void context.requestConfirmation(request()).then((decision) => { decisions.push(decision); });
    });
    const retainedRequest = context.requestConfirmation;
    await act(async () => { view.unmount(); });
    expect(decisions).toEqual([denied("provider_unmounted")]);
    expect(await retainedRequest(request())).toEqual(denied("provider_unmounted"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves default timeout and cooldown for sequential requests", async () => {
    render(<WebMcpConfirmProvider><Harness /></WebMcpConfirmProvider>);
    const decisions: ConfirmDecision[] = [];
    await act(async () => {
      void context.requestConfirmation(request({ timeoutMs: NaN })).then((decision) => { decisions.push(decision); });
    });
    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(decisions).toEqual([]);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(decisions).toEqual([denied("timeout")]);
    for (let i = 0; i < 10; i += 1) {
      await act(async () => { void context.requestConfirmation(request()); });
      await act(async () => { context.decide(denied("user_denied")); });
    }
    let cooldown!: Promise<ConfirmDecision>;
    await act(async () => { cooldown = context.requestConfirmation(request()); });
    expect(await cooldown).toEqual(denied("cooldown"));
    expect(context.pending).toBeNull();
  });
});
