// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/router", () => ({ useRouter: () => ({ pathname: "/webmcp", push: vi.fn() }) }));
vi.mock("./adapter", () => ({ isWebMCPSupported: () => false, registerTools: vi.fn() }));
vi.mock("./confirm/ConfirmModalHost", () => ({ default: () => null }));
vi.mock("./ActivityHud", () => ({ default: () => null }));

import WebMcpProvider, { useWebMcp } from "./WebMcpProvider";
import { useWebMcpConfirm } from "./confirm/context";
import { clearStoredApiKey, setStoredApiKey } from "../ui/developer/storage";
import { clearActiveBuyMission, clearWebMcpActionReceipts, getWebMcpActionReceipts } from "./ui-bridge";

let executeTool: ReturnType<typeof useWebMcp>["executeTool"];
let confirmation: ReturnType<typeof useWebMcpConfirm>;
function Harness() {
  const tools = useWebMcp();
  const confirm = useWebMcpConfirm();
  useEffect(() => { executeTool = tools.executeTool; confirmation = confirm; }, [tools, confirm]);
  return null;
}
const args = () => ({
  query: "Confirmation receipt regression", market_code: "FR", latitude: 48.86, longitude: 2.35,
  radius_km: 25, hard_budget_max: 1300, requirements: [], autonomous_actions: ["search"],
  contact_reveal: "manual_bilateral_approval", expires_at: new Date(Date.now() + 86_400_000).toISOString()
});

beforeEach(() => {
  setStoredApiKey("cd_test_confirmation_only");
  render(<WebMcpProvider><Harness /></WebMcpProvider>);
});
afterEach(() => {
  cleanup();
  clearStoredApiKey();
  clearActiveBuyMission();
  clearWebMcpActionReceipts();
  vi.restoreAllMocks();
});

// Existing provider tests mock the context and cannot observe cancellation
// while its real confirmation promise is pending.
it("records cancellation before approval as denied without dispatching a write", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network request"));
  const controller = new AbortController();
  let result!: ReturnType<typeof executeTool>;
  await act(async () => {
    result = executeTool("create_buy_mission", args(), { signal: controller.signal });
  });
  await waitFor(() => expect(confirmation.pending?.toolName).toBe("create_buy_mission"));
  await act(async () => { controller.abort(); await result; });
  expect(await result).toMatchObject({
    ok: false, error: { code: "USER_DENIED", details: { reason: "aborted" } }
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(confirmation.pending).toBeNull();
  expect(getWebMcpActionReceipts()).toMatchObject([
    { outcome: "denied", confirmation: "denied" }
  ]);
});

it("keeps a post-dispatch cancellation uncertain with the real confirmation context", async () => {
  const controller = new AbortController();
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    controller.abort();
    throw new DOMException("aborted after sending", "AbortError");
  });
  let result!: ReturnType<typeof executeTool>;
  await act(async () => {
    result = executeTool("create_buy_mission", args(), { signal: controller.signal });
  });
  await waitFor(() => expect(confirmation.pending?.toolName).toBe("create_buy_mission"));
  await act(async () => {
    confirmation.decide({ kind: "approve", args: confirmation.pending!.args });
    await result;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await result).toMatchObject({ ok: false, error: { code: "OUTCOME_UNKNOWN" } });
  expect(getWebMcpActionReceipts()).toMatchObject([
    { outcome: "unknown", confirmation: "approved" }
  ]);
});
