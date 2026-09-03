import { useCallback, useState } from "react";
import { Bot } from "lucide-react";

import { formatAmount } from "../../webmcp/activity/derive";

type SellerTurnResponse = {
  action: "accept" | "counter" | "noop";
  idempotent: boolean;
  reason: string | null;
  offer: { offer_id: string; amount: number; currency: string; status: string };
  listing_status: string | null;
};

type TurnState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: SellerTurnResponse }
  | { kind: "failed"; code: string; message: string };

function describe(result: SellerTurnResponse): { headline: string; next: string } {
  const amount = formatAmount(result.offer.amount, result.offer.currency) || `${result.offer.amount} ${result.offer.currency}`;
  if (result.action === "accept" || (result.action === "noop" && result.listing_status === "RESERVED")) {
    return {
      headline: `Seller accepted ${amount}. Listing is RESERVED.`,
      next: "Ask your agent to request the contact exchange: one consent alone reveals nothing."
    };
  }
  return {
    headline: `${result.idempotent ? "Seller's counter is still open at" : "Seller countered at"} ${amount}.`,
    next: "Now ask your agent to accept it. It is above your 1,300 EUR hard budget, so the server will answer APPROVAL_REQUIRED and hand the decision back to you."
  };
}

/**
 * One-click deterministic seller move so a judge with only the buyer key can reach the policy stop.
 * Only rendered when the judge reset capability is authorized on the isolated sandbox host.
 */
export default function SellerTurnButton({ apiKey, testIdPrefix = "webmcp-challenge" }: { apiKey: string | null; testIdPrefix?: string }) {
  const [state, setState] = useState<TurnState>({ kind: "idle" });

  const run = useCallback(async () => {
    if (!apiKey || state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const response = await fetch("/api/v1/sandbox/seller-turn", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: "{}"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setState({
          kind: "failed",
          code: payload?.error?.code || `HTTP_${response.status}`,
          message: payload?.error?.message || `Seller turn failed (${response.status})`
        });
        return;
      }
      setState({ kind: "done", result: payload as SellerTurnResponse });
    } catch (error: any) {
      setState({ kind: "failed", code: "NETWORK_ERROR", message: error?.message || "Network error" });
    }
  }, [apiKey, state.kind]);

  return (
    <div data-testid={`${testIdPrefix}-seller-turn`}>
      <button
        type="button"
        data-testid={`${testIdPrefix}-seller-turn-button`}
        disabled={!apiKey || state.kind === "running"}
        onClick={run}
        className="inline-flex h-11 w-full items-center justify-center gap-2 border border-secondary px-4 font-mono text-xs font-bold uppercase tracking-widest text-secondary transition enabled:hover:bg-secondary enabled:hover:text-bg disabled:cursor-not-allowed disabled:border-border disabled:text-subtle"
      >
        <Bot className={`h-4 w-4 ${state.kind === "running" ? "animate-pulse" : ""}`} aria-hidden="true" />
        {state.kind === "running" ? "Synthetic seller is thinking…" : "Let the synthetic seller respond"}
      </button>
      <div className="mt-3 min-h-10 font-mono text-[11px] leading-relaxed text-subtle" data-testid={`${testIdPrefix}-seller-turn-status`}>
        {state.kind === "idle" || state.kind === "running"
          ? "Deterministic policy: counters below 1,250 EUR at 1,350 EUR, accepts at or above. No LLM, no real seller."
          : null}
        {state.kind === "done" ? (
          <>
            <span className="block text-success" data-testid={`${testIdPrefix}-seller-turn-result`}>
              {describe(state.result).headline}
            </span>
            <span className="mt-1 block text-muted">{describe(state.result).next}</span>
          </>
        ) : null}
        {state.kind === "failed" ? (
          <span className="block text-error" data-code={state.code}>
            {state.code === "NO_OPEN_OFFER"
              ? "No open buyer offer yet. Ask your agent to make an offer first."
              : state.code === "SELLER_NOT_READY"
                ? "Run Reset demo data first so the synthetic seller exists."
                : state.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
