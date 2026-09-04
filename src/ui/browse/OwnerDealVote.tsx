import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";

export default function OwnerDealVote({ deal, localePrefix }: { deal: any; localePrefix: string }) {
  const t = useTranslations("browseDeals.vote");
  const sessionGate = useOwnerSessionGate();
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState({ up: Number(deal?.votes_up || 0), down: Number(deal?.votes_down || 0) });

  if (sessionGate === "pending") return null;
  if (sessionGate !== "authenticated") {
    const next = `/browse/deals/${deal.deal_id}`;
    return (
      <div className="border border-border bg-surface p-4 text-sm text-muted" data-testid="owner-vote-sign-in">
        {t("signedOutLead")} {" "}
        <Link
          href={`${localePrefix}/auth/login?next=${encodeURIComponent(next)}`}
          className="font-bold text-primary underline underline-offset-4"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  const submit = async () => {
    const cleaned = reason.trim();
    if (!direction || !cleaned) {
      setError(t("reasonRequired"));
      return;
    }
    setState("submitting");
    setError(null);
    try {
      const response = await fetch(`/api/v1/owner/deals/${encodeURIComponent(deal.deal_id)}/vote`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `${Date.now()}-${deal.deal_id}`
        },
        body: JSON.stringify({ direction, reason: cleaned })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
      setVotes({
        up: Number(body?.data?.deal?.votes_up || 0),
        down: Number(body?.data?.deal?.votes_down || 0)
      });
      setState("success");
    } catch (cause: any) {
      setError(cause?.message || t("failed"));
      setState("error");
    }
  };

  return (
    <section className="border border-border bg-surface p-4 space-y-3" data-testid="owner-deal-vote">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text">{t("title")}</h2>
          <p className="text-xs font-mono text-muted mt-1">{t("lead")}</p>
        </div>
        {votes.up + votes.down > 0 ? (
          <span className="text-xs font-mono text-subtle" data-testid="owner-vote-counts">
            {t("counts", { up: votes.up, down: votes.down })}
          </span>
        ) : null}
      </div>

      {state !== "success" ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection("up")}
              aria-pressed={direction === "up"}
              className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-bold uppercase ${direction === "up" ? "border-secondary bg-secondary/10 text-secondary" : "border-border text-muted"}`}
            >
              <ThumbsUp className="w-4 h-4" aria-hidden="true" />
              {t("up")}
            </button>
            <button
              type="button"
              onClick={() => setDirection("down")}
              aria-pressed={direction === "down"}
              className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-bold uppercase ${direction === "down" ? "border-error bg-error/10 text-error" : "border-border text-muted"}`}
            >
              <ThumbsDown className="w-4 h-4" aria-hidden="true" />
              {t("down")}
            </button>
          </div>
          {direction ? (
            <div className="space-y-2">
              <label htmlFor={`owner-vote-reason-${deal.deal_id}`} className="block text-xs font-mono text-subtle uppercase">
                {t("reason")}
              </label>
              <textarea
                id={`owner-vote-reason-${deal.deal_id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 240))}
                maxLength={240}
                rows={3}
                placeholder={t("reasonPlaceholder")}
                className="w-full border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={state === "submitting"}
                className="inline-flex items-center gap-2 border border-primary bg-primary px-4 py-2 text-xs font-bold uppercase text-bg disabled:opacity-50"
              >
                {state === "submitting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
                {state === "submitting" ? t("submitting") : t("submit")}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm font-mono text-secondary" role="status">{t("success")}</p>
      )}
      {error ? <p className="text-xs font-mono text-error" role="alert">{error}</p> : null}
    </section>
  );
}
