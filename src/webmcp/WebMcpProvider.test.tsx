/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("next/router", () => ({ useRouter: () => ({ pathname: "/webmcp", push: vi.fn() }) }));
vi.mock("./adapter", () => ({ isWebMCPSupported: () => false, registerTools: vi.fn() }));
vi.mock("./confirm/context", () => ({
  WebMcpConfirmProvider: ({ children }: { children: ReactNode }) => children,
  useWebMcpConfirm: () => ({ requestConfirmation: confirm })
}));
vi.mock("./confirm/ConfirmModalHost", () => ({ default: () => null }));
vi.mock("./ActivityHud", () => ({ default: () => null }));

import WebMcpProvider, { useWebMcp, type PendingToolAttempt } from "./WebMcpProvider";
import { clearStoredApiKey, setStoredApiKey } from "../ui/developer/storage";
import { clearActiveBuyMission, clearWebMcpActionReceipts } from "./ui-bridge";

let executeTool: ReturnType<typeof useWebMcp>["executeTool"];
function Harness() {
  const context = useWebMcp();
  useEffect(() => { executeTool = context.executeTool; }, [context.executeTool]);
  return null;
}
const args = () => ({
  query: "Original approved mission", market_code: "FR", latitude: 48.86, longitude: 2.35,
  radius_km: 25, hard_budget_max: 1300, requirements: [], autonomous_actions: ["search"],
  contact_reveal: "manual_bilateral_approval", expires_at: new Date(Date.now() + 86_400_000).toISOString()
});

beforeEach(() => {
  setStoredApiKey("cd_test_provider_only");
  confirm.mockImplementation(async request => ({ kind: "approve", args: request.args }));
  render(<WebMcpProvider><Harness /></WebMcpProvider>);
});
afterEach(() => {
  cleanup();
  clearStoredApiKey();
  clearActiveBuyMission();
  clearWebMcpActionReceipts();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// The human form has no AbortSignal input. This provider-level regression covers
// cancellation after dispatch, then reconciliation with a fresh caller signal.
it("replays an aborted write with original body and key but a fresh signal/request id", async () => {
  const attempts = new Map<string, PendingToolAttempt>();
  const originalSignal = new AbortController();
  const freshSignal = new AbortController();
  const requests: RequestInit[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    requests.push(init!);
    if (requests.length === 1) {
      originalSignal.abort();
      throw new DOMException("aborted after sending", "AbortError");
    }
    return new Response(JSON.stringify({ ...JSON.parse(String(init!.body)), watchlist_id: "77777777-7777-4777-8777-777777777777" }), { status: 201, headers: { "content-type": "application/json" } });
  });
  const original = args();
  await act(async () => {
    const first = await executeTool("create_buy_mission", original, { pendingAttempts: attempts, signal: originalSignal.signal });
    expect(first).toMatchObject({ ok: false, error: { code: "OUTCOME_UNKNOWN" } });
    const replay = await executeTool("create_buy_mission", { ...original, query: "Edited unapproved mission", hard_budget_max: 2500 }, { pendingAttempts: attempts, signal: freshSignal.signal });
    expect(replay).toMatchObject({ ok: true, data: { mission: { query: original.query, hard_budget_max: original.hard_budget_max } } });
  });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toBe(requests[0].body);
  expect(requests[0].signal).toBe(originalSignal.signal);
  expect(requests[1].signal).toBe(freshSignal.signal);
  const headers = requests.map(request => new Headers(request.headers));
  expect(headers[1].get("idempotency-key")).toBe(headers[0].get("idempotency-key"));
  expect(headers[1].get("authorization")).toBe(headers[0].get("authorization"));
  expect(headers[1].get("x-request-id")).not.toBe(headers[0].get("x-request-id"));
});

it("does not start an attempt or consume confirmation for an already aborted signal", async () => {
  const attempts = new Map<string, PendingToolAttempt>();
  const controller = new AbortController();
  controller.abort();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  await act(async () => {
    await expect(executeTool("create_buy_mission", args(), { pendingAttempts: attempts, signal: controller.signal }))
      .resolves.toMatchObject({ ok: false, error: { code: "ABORTED" } });
  });
  expect(attempts.size).toBe(0);
  expect(confirm).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("retains an uncertain attempt across a later auth rejection", async () => {
  const attempts = new Map<string, PendingToolAttempt>();
  const bodies: string[] = [];
  const keys: Array<string | null> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    bodies.push(String(init!.body));
    keys.push(new Headers(init!.headers).get("idempotency-key"));
    if (bodies.length === 1) return new Response("gateway failed", { status: 502 });
    if (bodies.length === 2) return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Authentication temporarily unavailable" } }), { status: 401, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ...JSON.parse(String(init!.body)), watchlist_id: "88888888-8888-4888-8888-888888888888" }), { status: 201, headers: { "content-type": "application/json" } });
  });
  const original = args();
  await act(async () => {
    await expect(executeTool("create_buy_mission", original, { pendingAttempts: attempts })).resolves.toMatchObject({ ok: false, error: { code: "OUTCOME_UNKNOWN" } });
    await expect(executeTool("create_buy_mission", original, { pendingAttempts: attempts })).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    await expect(executeTool("create_buy_mission", { ...original, query: "Changed" }, { pendingAttempts: attempts })).resolves.toMatchObject({ ok: true, data: { mission: { query: original.query } } });
  });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(new Set(bodies).size).toBe(1);
  expect(new Set(keys).size).toBe(1);
});
