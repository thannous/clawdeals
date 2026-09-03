import { useCallback, useState } from "react";
import { Bot } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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

function describe(
  result: SellerTurnResponse,
  locale: string
): { headlineKey: string; nextKey: string; values: { amount: string } } {
  const amount =
    formatAmount(result.offer.amount, result.offer.currency, locale) ||
    `${result.offer.amount} ${result.offer.currency}`;
  if (result.action === "accept" || (result.action === "noop" && result.listing_status === "RESERVED")) {
    return {
      headlineKey: "sellerTurn.accepted",
      nextKey: "sellerTurn.acceptedNext",
      values: { amount }
    };
  }
  return {
    headlineKey: result.idempotent ? "sellerTurn.counterStillOpen" : "sellerTurn.countered",
    nextKey: "sellerTurn.counteredNext",
    values: { amount }
  };
}

/**
 * One-click deterministic seller move so a judge with only the buyer key can reach the policy stop.
 * Only rendered when the judge reset capability is authorized on the isolated sandbox host.
 */
export default function SellerTurnButton({
  apiKey,
  testIdPrefix = "webmcp-challenge"
}: {
  apiKey: string | null;
  testIdPrefix?: string;
}) {
  const t = useTranslations("webmcp");
  const locale = useLocale();
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
          message: t("sellerTurn.failed", { status: response.status })
        });
        return;
      }
      setState({ kind: "done", result: payload as SellerTurnResponse });
    } catch {
      setState({ kind: "failed", code: "NETWORK_ERROR", message: t("sellerTurn.networkError") });
    }
  }, [apiKey, state.kind, t]);

  const resultCopy = state.kind === "done" ? describe(state.result, locale) : null;

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
        {state.kind === "running" ? t("sellerTurn.thinking") : t("sellerTurn.run")}
      </button>
      <div
        className="mt-3 min-h-10 font-mono text-[11px] leading-relaxed text-subtle"
        data-testid={`${testIdPrefix}-seller-turn-status`}
      >
        {state.kind === "idle" || state.kind === "running" ? t("sellerTurn.policy") : null}
        {state.kind === "done" ? (
          <>
            <span className="block text-success" data-testid={`${testIdPrefix}-seller-turn-result`}>
              {resultCopy ? t(resultCopy.headlineKey, resultCopy.values) : null}
            </span>
            <span className="mt-1 block text-muted">{resultCopy ? t(resultCopy.nextKey) : null}</span>
          </>
        ) : null}
        {state.kind === "failed" ? (
          <span className="block text-error" data-code={state.code}>
            {state.code === "NO_OPEN_OFFER"
              ? t("sellerTurn.noOpenOffer")
              : state.code === "SELLER_NOT_READY"
                ? t("sellerTurn.notReady")
                : state.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
