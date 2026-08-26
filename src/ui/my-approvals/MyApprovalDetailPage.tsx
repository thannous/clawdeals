import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import Link from "next/link";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import TruncatedId from "../console/shared/TruncatedId";
import ErrorState from "../console/shared/ErrorState";
import { formatDate } from "../console/shared/formatDate";
import { useMyApprovalAction } from "./useMyApprovalAction";

export default function MyApprovalDetailPage() {
  const t = useTranslations("myApprovals");
  const router = useRouter();
  const approvalId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;

  const [approval, setApproval] = useState<any>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [editedAmount, setEditedAmount] = useState("");

  const fetchApproval = useCallback(async (id: string) => {
    setFetchState("loading");
    try {
      const resp = await fetch(`/api/v1/approvals/${id}`);
      if (resp.status === 401) {
        const next = encodeURIComponent(router.asPath || "/my/approvals");
        void router.replace(`/auth/login?next=${next}`);
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const loaded = data?.data || null;
      setApproval(loaded);
      const proposedAmount = loaded?.action_payload_redacted?.offer?.amount ?? loaded?.action_ref?.amount;
      setEditedAmount(typeof proposedAmount === "number" ? String(proposedAmount) : "");
      setFetchState("done");
    } catch (err: any) {
      setError(err.message);
      setFetchState("error");
    }
  }, [router]);

  useEffect(() => {
    if (!approvalId) return;
    fetchApproval(approvalId);
  }, [approvalId, fetchApproval]);

  const { execute, submitState, error: submitError } = useMyApprovalAction({
    onSuccess: () => { if (approvalId) fetchApproval(approvalId); },
  });

  const missionOfferApproval =
    approval?.action_type === "offer_over_budget" && Boolean(approval?.action_ref?.mission_id);
  const currency = String(
    approval?.action_payload_redacted?.offer?.currency || approval?.action_ref?.currency || "EUR"
  );
  const hardBudgetMax =
    approval?.action_payload_redacted?.policy?.hard_budget_max ?? null;
  const policyReason = String(
    approval?.action_payload_redacted?.policy?.reason ||
      approval?.action_ref?.policy_reason ||
      "human_review_required"
  );
  const parsedEditedAmount = Number(editedAmount);
  const editedAmountValid =
    editedAmount.trim() !== "" &&
    Number.isSafeInteger(parsedEditedAmount) &&
    parsedEditedAmount >= 0 &&
    parsedEditedAmount <= 2_147_483_647;

  return (
    <div data-testid="my-approval-detail-page" className="min-h-screen bg-bg">
      <PageHeader title={t("detail.title")}>
        <AppNav current="approvals" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6 max-w-3xl">
        <button
          onClick={() => router.push("/my/approvals")}
          className="text-xs font-mono text-muted hover:text-text transition-colors"
        >
          ← {t("detail.back")}
        </button>

        {fetchState === "loading" && (
          <div className="text-xs font-mono text-subtle animate-pulse">Loading…</div>
        )}
        {fetchState === "error" && (
          <ErrorState message={error || t("detail.failedToLoad")} onRetry={() => approvalId && fetchApproval(approvalId)} />
        )}

        {fetchState === "done" && approval && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-text">{approval.action_type || "—"}</h2>
              <ConsoleStatusBadge value={approval.state} variant="approval" />
            </div>

            {missionOfferApproval && (
              <section
                data-testid="editable-offer-approval-sheet"
                className="border border-primary/30 bg-surface p-5 space-y-5"
              >
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-subtle">
                    {t("detail.missionOffer.requestedActionLabel")}
                  </p>
                  <p className="mt-1 text-base font-semibold text-text">
                    {t("detail.missionOffer.requestedAction")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-subtle">
                    {t("detail.missionOffer.whyLabel")}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {policyReason === "hard_budget_exceeded"
                      ? hardBudgetMax !== null
                        ? t("detail.missionOffer.limitReason", {
                            limit: hardBudgetMax,
                            currency
                          })
                        : t("detail.missionOffer.limitReasonUnknown")
                      : t("detail.missionOffer.reviewReason")}
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="approval-offer-amount"
                    className="text-[10px] font-mono uppercase tracking-widest text-subtle"
                  >
                    {t("detail.missionOffer.amountLabel")}
                  </label>
                  <div className="mt-2 flex items-center gap-2 max-w-sm">
                    <input
                      id="approval-offer-amount"
                      data-testid="approval-offer-amount"
                      type="number"
                      min="0"
                      max="2147483647"
                      step="1"
                      value={editedAmount}
                      onChange={(event) => setEditedAmount(event.target.value)}
                      className="min-w-0 flex-1 border border-border bg-bg px-3 py-2 text-sm font-mono text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                    <span className="text-sm font-mono text-muted">{currency}</span>
                  </div>
                  {!editedAmountValid && (
                    <p className="mt-2 text-xs font-mono text-error">
                      {t("detail.missionOffer.amountError")}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-subtle">
                    {t("detail.missionOffer.consequencesLabel")}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t("detail.missionOffer.consequences")}
                  </p>
                </div>
              </section>
            )}

            {/* Action buttons for PENDING */}
            {approval.state === "PENDING" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={
                      submitState === "loading" ||
                      (missionOfferApproval && !editedAmountValid)
                    }
                    onClick={() =>
                      execute(approval.approval_id, "approve", {
                        ...(missionOfferApproval ? { amount: parsedEditedAmount } : {})
                      })
                    }
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-success/50 text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                  >
                    {t("detail.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={submitState === "loading"}
                    onClick={() => execute(approval.approval_id, "deny")}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-error/50 text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                  >
                    {t("detail.deny")}
                  </button>
                </div>
                {submitError && <p className="text-xs font-mono text-error">{submitError}</p>}
              </div>
            )}

            {/* Detail grid */}
            <div className="bg-surface border border-border p-4 space-y-3">
              <DetailRow label={t("detail.approvalId")}>
                <TruncatedId id={approval.approval_id} />
              </DetailRow>
              <DetailRow label={t("detail.actionType")}>
                <span className="text-sm font-mono">{approval.action_type || "—"}</span>
              </DetailRow>
              <DetailRow label={t("detail.reference")}>
                {approval.action_ref_id ? (
                  <Link
                    href={`/my/listings/${approval.action_ref_id}`}
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {approval.action_ref_id}
                  </Link>
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </DetailRow>
              <DetailRow label={t("detail.created")}>
                <span className="text-xs font-mono text-subtle">{formatDate(approval.created_at)}</span>
              </DetailRow>
              {approval.resolved_at && (
                <DetailRow label={t("detail.resolved")}>
                  <span className="text-xs font-mono text-subtle">{formatDate(approval.resolved_at)}</span>
                </DetailRow>
              )}
              {approval.resolved_reason_text && (
                <DetailRow label={t("detail.reason")}>
                  <span className="text-sm text-text">{approval.resolved_reason_text}</span>
                </DetailRow>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-xs font-mono text-subtle uppercase tracking-wider min-w-[100px] shrink-0 pt-0.5">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
