import { describe, expect, it } from "vitest";

import type { BuyMissionView } from "../ui-bridge";
import { applyPrimaryField, summarizeConfirmRequest } from "./summarize";
import type { ConfirmRequest } from "./types";

const mission: BuyMissionView = {
  mission_id: "m1",
  status: "ACTIVE",
  query: "used e-bike",
  preferred_price_max: 1200,
  hard_budget_max: 1300,
  currency: "EUR",
  requirements: ["battery_health >= 80%"],
  autonomous_actions: ["search", "ask_question", "make_offer"],
  contact_reveal: "manual_bilateral_approval",
  expires_at: "2026-09-10T00:00:00.000Z",
  location: { label: "Paris", lat: 48.85, lon: 2.35, radius_km: 25 }
};

function request(toolName: string, args: unknown): ConfirmRequest {
  return { toolName, toolDescription: `desc ${toolName}`, toolScope: "write", outputHint: "hint", args, requestId: "req", timeoutMs: 60_000 };
}

describe("summarizeConfirmRequest", () => {
  it("explains an in-policy offer with an editable amount", () => {
    const summary = summarizeConfirmRequest(
      request("make_offer", { mission_id: "m1", listing_id: "90000000-0000-4000-8000-000000000001", amount: 1100, currency: "EUR" }),
      mission
    );
    expect(summary.title).toBe("Send an offer");
    expect(summary.sentence).toContain("€1,100");
    expect(summary.primaryField).toMatchObject({ key: "amount", kind: "amount", value: 1100, currency: "EUR" });
    expect(summary.policyHint).toMatchObject({ tone: "ok" });
    expect(summary.policyHint?.text).toContain("€1,300");
  });

  it("warns when the amount exceeds the hard budget", () => {
    const summary = summarizeConfirmRequest(request("make_offer", { amount: 1350, currency: "EUR" }), mission);
    expect(summary.policyHint).toMatchObject({ tone: "warn" });
    expect(summary.policyHint?.text).toMatch(/owner approval/i);
  });

  it("describes counters, accepts, declines and consent", () => {
    expect(summarizeConfirmRequest(request("respond_to_offer", { action: "counter", amount: 1290, currency: "EUR", offer_id: "o" }), mission)).toMatchObject({
      title: "Counter the offer",
      primaryField: { key: "amount", value: 1290 }
    });
    expect(summarizeConfirmRequest(request("respond_to_offer", { action: "accept", offer_id: "o" }), mission)).toMatchObject({
      title: "Accept the offer",
      primaryField: null
    });
    expect(summarizeConfirmRequest(request("respond_to_offer", { action: "decline", offer_id: "o" }), null).title).toBe("Decline the offer");
    expect(summarizeConfirmRequest(request("request_contact_reveal", { tx_id: "t" }), null).consequence).toMatch(/other owner consents/);
  });

  it("covers mission creation, threads, messages and owner approvals", () => {
    expect(summarizeConfirmRequest(request("create_buy_mission", { query: "used e-bike", location_label: "Paris", radius_km: 25, hard_budget_max: 1300, preferred_price_max: 1200, currency: "EUR" }), null).sentence).toBe(
      "Delegate the search for “used e-bike” around Paris (25 km) with a hard budget of €1,300 and a preferred price of €1,200."
    );
    expect(summarizeConfirmRequest(request("start_thread", { intent: "BUY", listing_id: "l", initial_question: "Battery health?" }), null).sentence).toContain("Battery health?");
    expect(summarizeConfirmRequest(request("send_message", { thread_id: "t", type: "question", text: "Invoice?" }), null).primaryField).toMatchObject({ key: "text", value: "Invoice?" });
    expect(summarizeConfirmRequest(request("resolve_approval", { decision: "approve", amount: 1290 }), null)).toMatchObject({
      title: "Approve the pending action",
      primaryField: { key: "amount", value: 1290 }
    });
  });

  it("falls back to the tool description for unknown tools", () => {
    const summary = summarizeConfirmRequest(request("clawdeals.listings_create_draft", { title: "x" }), null);
    expect(summary.title).toBe("Confirm tool execution");
    expect(summary.sentence).toBe("desc clawdeals.listings_create_draft");
    expect(summary.primaryField).toBeNull();
  });
});

describe("applyPrimaryField", () => {
  const field = { key: "amount", label: "Offer amount", kind: "amount" as const, value: 1100, currency: "EUR" };

  it("rewrites the amount and validates integers", () => {
    expect(applyPrimaryField({ amount: 1100, listing_id: "l" }, field, "1250")).toEqual({ args: { amount: 1250, listing_id: "l" }, error: null });
    expect(applyPrimaryField({ amount: 1100 }, field, "12.5").error).toMatch(/whole/);
    expect(applyPrimaryField({ amount: 1100 }, field, "").error).toMatch(/Enter/);
  });

  it("rewrites text fields and rejects empty text", () => {
    const textField = { key: "text", label: "Message", kind: "text" as const, value: "a", currency: null };
    expect(applyPrimaryField({ text: "a" }, textField, "Is the invoice available?").args).toEqual({ text: "Is the invoice available?" });
    expect(applyPrimaryField({ text: "a" }, textField, "   ").error).toBeTruthy();
  });
});
