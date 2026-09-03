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
  return {
    toolName,
    toolDescription: `desc ${toolName}`,
    toolScope: "write",
    outputHint: "hint",
    args,
    requestId: "req",
    timeoutMs: 60_000
  };
}

describe("summarizeConfirmRequest", () => {
  it("explains an in-policy offer with an editable amount", () => {
    const summary = summarizeConfirmRequest(
      request("make_offer", {
        mission_id: "m1",
        listing_id: "90000000-0000-4000-8000-000000000001",
        amount: 1100,
        currency: "EUR"
      }),
      mission
    );
    expect(summary.title).toEqual({
      key: "confirm.makeOffer.title",
      values: undefined
    });
    expect(summary.sentence).toMatchObject({
      key: "confirm.makeOffer.sentence",
      values: { amount: 1100, currency: "EUR" }
    });
    expect(summary.primaryField).toMatchObject({
      key: "amount",
      kind: "amount",
      value: 1100,
      currency: "EUR"
    });
    expect(summary.policyHint).toMatchObject({ tone: "ok" });
    expect(summary.policyHint?.message).toMatchObject({
      key: "confirm.policy.within",
      values: { ceiling: 1300, currency: "EUR" }
    });
  });

  it("warns when the amount exceeds the hard budget", () => {
    const summary = summarizeConfirmRequest(request("make_offer", { amount: 1350, currency: "EUR" }), mission);
    expect(summary.policyHint).toMatchObject({ tone: "warn" });
    expect(summary.policyHint?.message.key).toBe("confirm.policy.exceeds");
  });

  it("describes counters, accepts, declines and consent", () => {
    expect(
      summarizeConfirmRequest(
        request("respond_to_offer", {
          action: "counter",
          amount: 1290,
          currency: "EUR",
          offer_id: "o"
        }),
        mission
      )
    ).toMatchObject({
      title: { key: "confirm.counter.title" },
      primaryField: { key: "amount", value: 1290 }
    });
    expect(
      summarizeConfirmRequest(request("respond_to_offer", { action: "accept", offer_id: "o" }), mission)
    ).toMatchObject({
      title: { key: "confirm.accept.title" },
      primaryField: null
    });
    expect(
      summarizeConfirmRequest(request("respond_to_offer", { action: "decline", offer_id: "o" }), null).title.key
    ).toBe("confirm.decline.title");
    expect(summarizeConfirmRequest(request("request_contact_reveal", { tx_id: "t" }), null).consequence.key).toBe(
      "confirm.contact.consequence"
    );
  });

  it("covers mission creation, threads, messages and owner approvals", () => {
    expect(
      summarizeConfirmRequest(
        request("create_buy_mission", {
          query: "used e-bike",
          location_label: "Paris",
          radius_km: 25,
          hard_budget_max: 1300,
          preferred_price_max: 1200,
          currency: "EUR"
        }),
        null
      ).sentence
    ).toMatchObject({
      key: "confirm.createMission.sentence",
      values: {
        query: "used e-bike",
        where: "Paris",
        radius: 25,
        hard: 1300,
        preferred: 1200,
        currency: "EUR"
      }
    });
    expect(
      summarizeConfirmRequest(
        request("start_thread", {
          intent: "BUY",
          listing_id: "l",
          initial_question: "Battery health?"
        }),
        null
      ).sentence
    ).toMatchObject({
      key: "confirm.startThread.purchaseWithQuestion",
      values: { question: "Battery health?" }
    });
    expect(
      summarizeConfirmRequest(
        request("send_message", {
          thread_id: "t",
          type: "question",
          text: "Invoice?"
        }),
        null
      ).primaryField
    ).toMatchObject({ key: "text", value: "Invoice?" });
    expect(
      summarizeConfirmRequest(request("resolve_approval", { decision: "approve", amount: 1290 }), null)
    ).toMatchObject({
      title: { key: "confirm.resolve.approveTitle" },
      sentence: { key: "confirm.resolve.approveEdited" },
      primaryField: { key: "amount", value: 1290 }
    });
  });

  it("uses localized generic copy for unknown tools", () => {
    const summary = summarizeConfirmRequest(request("clawdeals.listings_create_draft", { title: "x" }), null);
    expect(summary.title.key).toBe("confirm.fallback.title");
    expect(summary.sentence).toEqual({
      key: "confirm.fallback.sentence",
      values: undefined
    });
    expect(summary.consequence).toEqual({
      key: "confirm.fallback.consequence",
      values: undefined
    });
    expect(summary.primaryField).toBeNull();
  });
});

describe("applyPrimaryField", () => {
  const field = {
    key: "amount",
    labelKey: "confirm.fields.offerAmount",
    kind: "amount" as const,
    value: 1100,
    currency: "EUR"
  };

  it("rewrites the amount and validates integers", () => {
    expect(applyPrimaryField({ amount: 1100, listing_id: "l" }, field, "1250")).toEqual({
      args: { amount: 1250, listing_id: "l" },
      error: null
    });
    expect(applyPrimaryField({ amount: 1100 }, field, "12.5").error).toBe("confirm.errors.wholeAmount");
    expect(applyPrimaryField({ amount: 1100 }, field, "").error).toBe("confirm.errors.enterAmount");
  });

  it("rewrites text fields and rejects empty text", () => {
    const textField = {
      key: "text",
      labelKey: "confirm.fields.message",
      kind: "text" as const,
      value: "a",
      currency: null
    };
    expect(applyPrimaryField({ text: "a" }, textField, "Is the invoice available?").args).toEqual({
      text: "Is the invoice available?"
    });
    expect(applyPrimaryField({ text: "a" }, textField, "   ").error).toBeTruthy();
  });
});
