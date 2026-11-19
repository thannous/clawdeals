import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import ConfirmModal from "../shared/ConfirmModal";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import ToastContainer from "../shared/Toast";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";
import { useToast } from "../shared/useToast";
import PageHeader from "../../shared/PageHeader";
import DisputeSummary from "../../protected-checkout/DisputeSummary";
import EvidenceList from "../../protected-checkout/EvidenceList";
import InspectionNotice from "../../protected-checkout/InspectionNotice";
import { Badge, Field, Section, escrowStatusTone } from "../../protected-checkout/Section";
import TermsCard from "../../protected-checkout/TermsCard";
import TrackingCard from "../../protected-checkout/TrackingCard";
import { useConsoleResource } from "./useConsoleResource";

type Resolution = "REFUND" | "RELEASE";

export default function DisputeReviewPage() {
  const t = useTranslations("protectedCheckout");
  const decisions = {
    REFUND: { label: t("review.refund"), title: t("review.refundTitle"), message: t("review.refundHelp") },
    RELEASE: { label: t("review.release"), title: t("review.releaseTitle"), message: t("review.releaseHelp") }
  };
  const router = useRouter();
  const disputeId = useMemo(() => {
    const raw = router.query.dispute_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.dispute_id]);

  const base = disputeId ? `/api/console/disputes/${encodeURIComponent(disputeId)}` : null;
  const { data: review, fetchState, error, reload } = useConsoleResource(base ? `${base}/review` : null);
  const toast = useToast();

  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<Resolution | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const decide = async () => {
    if (!pending || !base) return;
    setSubmitting(true);
    setDecisionError(null);
    try {
      const resp = await fetch(`${base}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `${Date.now()}-${disputeId}`
        },
        body: JSON.stringify({ resolution: pending, notes: notes.trim() || null })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      toast.show(t("review.saved"), "success");
      setNotes("");
      await reload({ silent: true });
    } catch (err: any) {
      setDecisionError(err.message);
    } finally {
      setSubmitting(false);
      setPending(null);
    }
  };

  const fileBase = `${base}/evidence`;
  const decisionRequired = Boolean(review?.decision?.required);

  return (
    <div data-testid="console-dispute-review-page" className="min-h-screen bg-bg">
      <PageHeader
        left={
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/console/disputes"
              className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary transition-colors"
            >
              &larr; {t("review.back")}
            </Link>
            <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
              <span className="text-primary">/ </span>{t("review.detailTitle")}
            </h1>
          </div>
        }
      />

      <main id="main-content" tabIndex={-1} className="w-full max-w-5xl px-4 py-6 space-y-6">
        {(fetchState === "idle" || fetchState === "loading") && <SkeletonTable columns={4} rows={6} />}
        {fetchState === "error" && <ErrorState message={error || t("review.failedDetail")} onRetry={() => reload()} />}

        {fetchState === "done" && review && (
          <>
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span data-testid="review-escrow-status" data-status={review.escrow.status}>
                  <Badge tone={escrowStatusTone(review.escrow.status)}>{t(`status.${review.escrow.status}`)}</Badge>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t("review.disputeId")}>
                  <TruncatedId id={review.dispute.dispute_id} />
                </Field>
                <Field label={t("review.escrowId")}>
                  <TruncatedId id={review.escrow.escrow_id} />
                </Field>
                <Field label={t("review.amount")}>
                  {review.escrow.amount_gross_minor} {review.escrow.currency}
                </Field>
                <Field label={t("review.created")}>{formatDate(review.escrow.created_at)}</Field>
              </div>
            </section>

            <TermsCard terms={review.terms} />

            <TrackingCard shipment={review.shipment} />

            <InspectionNotice inspection={review.inspection} escrowStatus={review.escrow.status} />

            <Section title={t("dispute.title")} testId="review-dispute">
              <DisputeSummary dispute={review.dispute} />
            </Section>

            <Section title={t("dispute.evidence")} testId="review-evidence">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{t("dispute.party.BUYER")}</p>
                  <EvidenceList testId="review-evidence-buyer" items={review.evidence?.buyer || []} fileBase={fileBase} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{t("dispute.party.SELLER")}</p>
                  <EvidenceList testId="review-evidence-seller" items={review.evidence?.seller || []} fileBase={fileBase} />
                </div>
              </div>
            </Section>

            <Section title={t("dispute.decision")} testId="review-decision">
              {decisionRequired ? (
                <>
                  <p className="text-sm text-muted">
                    {t("review.instruction")}
                  </p>
                  <label className="block space-y-1">
                    <span className="text-xs font-mono text-subtle uppercase tracking-wider">{t("review.notes")}</span>
                    <textarea
                      data-testid="review-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={500}
                      rows={3}
                      className="w-full px-3 py-2 text-sm bg-bg border border-border rounded text-text focus:outline-none focus:border-primary"
                    />
                  </label>
                  {decisionError && (
                    <p role="alert" data-testid="review-decision-error" className="text-sm text-error-muted">
                      {decisionError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {(Object.keys(decisions) as Resolution[]).map((resolution) => (
                      <button
                        key={resolution}
                        type="button"
                        data-testid={`review-decide-${resolution.toLowerCase()}`}
                        disabled={submitting}
                        onClick={() => setPending(resolution)}
                        className="inline-flex min-h-11 items-center justify-center px-4 py-2 border border-primary text-primary hover:bg-primary/10 text-sm font-semibold disabled:opacity-50"
                      >
                        {decisions[resolution].label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p data-testid="review-decided" className="text-sm text-text">
                  {t("review.decided", { date: formatDate(review.dispute.resolved_at), resolution: t(`dispute.resolution.${review.dispute.resolution}`) })}
                </p>
              )}
            </Section>
          </>
        )}
      </main>

      <ConfirmModal
        open={pending !== null}
        title={pending ? decisions[pending].title : ""}
        message={pending ? decisions[pending].message : ""}
        confirmLabel={pending ? decisions[pending].label : ""}
        cancelLabel={t("cancel")}
        variant={pending === "REFUND" ? "danger" : "success"}
        loading={submitting}
        onConfirm={decide}
        onCancel={() => setPending(null)}
      />
      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
