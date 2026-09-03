// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, number | string>) => {
    const messages: Record<string, string> = {
      "confirm.makeOffer.sentence": "Send a binding offer of €{amount} on listing {listingId}.",
      "confirm.modal.approve": "Approve", "confirm.modal.approveEdited": "Approve edited", "confirm.modal.reject": "Reject",
      "confirm.modal.editJson": "Edit tool parameters JSON", "confirm.errors.invalidJson": "Invalid JSON. Fix the payload or reset it."
    };
    return (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => {
      const value = values?.[name] ?? "";
      return name === "amount" && typeof value === "number" ? value.toLocaleString("en") : String(value);
    });
  }
}));

import type { ConfirmRequest } from "./types";

const state = vi.hoisted(() => ({
  pending: null as ConfirmRequest | null,
  decide: vi.fn(),
  mission: null as any
}));

vi.mock("./context", () => ({
  useWebMcpConfirm: () => ({ pending: state.pending, decide: state.decide, history: [], cooldownUntilMs: null })
}));

vi.mock("../ui-bridge", () => ({
  getActiveBuyMission: () => state.mission,
  subscribeActiveBuyMission: () => () => undefined
}));

import ConfirmModalHost from "./ConfirmModalHost";

const offerRequest: ConfirmRequest = {
  toolName: "make_offer",
  toolDescription: "Make an offer",
  toolScope: "write",
  outputHint: "Offer metadata",
  args: { mission_id: "m1", listing_id: "90000000-0000-4000-8000-000000000001", amount: 1100, currency: "EUR", expires_at: "2026-09-10T00:00:00.000Z" },
  requestId: "req-confirm-1",
  timeoutMs: 60_000
};

afterEach(cleanup);
beforeEach(() => {
  state.decide.mockReset();
  state.pending = offerRequest;
  state.mission = {
    mission_id: "m1",
    status: "ACTIVE",
    query: "used e-bike",
    preferred_price_max: 1200,
    hard_budget_max: 1300,
    currency: "EUR",
    requirements: [],
    autonomous_actions: ["search"],
    contact_reveal: "manual_bilateral_approval",
    expires_at: "2026-09-10T00:00:00.000Z",
    location: { label: "Paris", lat: 48.85, lon: 2.35, radius_km: 25 }
  };
});

describe("ConfirmModalHost", () => {
  it("renders nothing when no confirmation is pending", () => {
    state.pending = null;
    render(<ConfirmModalHost />);
    expect(screen.queryByTestId("webmcp-confirm-modal")).toBeNull();
  });

  it("shows a human sentence and approves the original args untouched", () => {
    render(<ConfirmModalHost />);
    expect(screen.getByTestId("webmcp-confirm-sentence").textContent).toContain("€1,100");
    expect(screen.getByTestId("webmcp-confirm-policy-hint").getAttribute("data-tone")).toBe("ok");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(state.decide).toHaveBeenCalledWith({ kind: "approve", args: offerRequest.args });
  });

  it("lets the human edit the amount without touching JSON and warns above the hard budget", () => {
    render(<ConfirmModalHost />);
    const field = screen.getByTestId("webmcp-confirm-primary-field") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1350" } });

    expect(screen.getByTestId("webmcp-confirm-policy-hint").getAttribute("data-tone")).toBe("warn");
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(state.decide).toHaveBeenCalledWith({
      kind: "approve",
      args: { ...(offerRequest.args as object), amount: 1350 }
    });
  });

  it("rejects only through the explicit button; Escape and overlay never decide", () => {
    render(<ConfirmModalHost />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(state.decide).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Reject");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(state.decide).toHaveBeenCalledWith({ kind: "deny", code: "USER_DENIED", reason: "user_denied" });
  });

  it("refuses to approve invalid JSON from the advanced editor", () => {
    render(<ConfirmModalHost />);
    fireEvent.change(screen.getByLabelText("Edit tool parameters JSON"), { target: { value: "{ not json" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(state.decide).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Invalid JSON/);
  });
});
