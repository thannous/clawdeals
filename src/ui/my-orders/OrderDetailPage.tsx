import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import ErrorState from "../console/shared/ErrorState";
import SkeletonTable from "../console/shared/SkeletonTable";
import ConfirmModal from "../console/shared/ConfirmModal";
import PageHeader from "../shared/PageHeader";
import AppNav from "../shared/AppNav";
import DisputeSummary from "../protected-checkout/DisputeSummary";
import EvidenceList from "../protected-checkout/EvidenceList";
import InspectionNotice from "../protected-checkout/InspectionNotice";
import { Badge, Field, Section, escrowStatusTone } from "../protected-checkout/Section";
import TermsCard from "../protected-checkout/TermsCard";
import TrackingCard from "../protected-checkout/TrackingCard";
import { EVIDENCE_CONTENT_TYPES, formatMoney, getJson, postJson, uploadEvidenceFile } from "./orderApi";
import { useOrder } from "./useOrders";

const CARRIERS = ["colissimo", "mondial_relay", "chronopost", "royal_mail", "correos", "dhl", "ups", "other"];
const REASONS = ["not_as_described", "item_not_received", "fraud_suspected", "other"];
const KNOWN_ERRORS = ["INSPECTION_WINDOW_CLOSED", "TRACKING_NUMBER_IN_USE", "SHIPMENT_TRACKED", "INVALID_STATE", "VALIDATION_ERROR"];

const INPUT =
  "w-full min-h-11 px-3 py-2 text-sm bg-bg border border-border rounded text-text focus:outline-none focus:border-primary";
const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center px-4 py-2 border border-primary text-primary hover:bg-primary/10 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed";
const DANGER_BUTTON =
  "inline-flex min-h-11 items-center justify-center px-4 py-2 border border-warning text-warning hover:bg-warning/10 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed";

export default function OrderDetailPage() {
  const t = useTranslations("protectedCheckout");
  const router = useRouter();
  const escrowId = useMemo(() => {
    const raw = router.query.escrow_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.escrow_id]);

  const { data: order, fetchState, error, reload } = useOrder(escrowId);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [evidenceError, setEvidenceError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [statement, setStatement] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const disputeId: string | null = order?.dispute?.dispute_id || null;
  const base = escrowId ? `/api/v1/escrows/${encodeURIComponent(escrowId)}` : "";

  const loadEvidence = useCallback(async () => {
    if (!disputeId) return;
    try {
      const body = await getJson(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence`);
      setEvidence(body?.items || []);
      setEvidenceError(false);
    } catch {
      setEvidenceError(true);
    }
  }, [disputeId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadEvidence(), 0);
    return () => clearTimeout(timer);
  }, [loadEvidence]);

  useEffect(() => {
    if (!order) return;
    const timer = setInterval(() => {
      void reload({ silent: true });
      void loadEvidence();
    }, 30_000);
    return () => clearInterval(timer);
  }, [order, reload, loadEvidence]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(t("saved"));
      await reload({ silent: true });
      await loadEvidence();
    } catch (err: any) {
      setActionError(KNOWN_ERRORS.includes(err?.code) ? t(`errors.${err.code}`) : err?.message || t("errors.generic"));
    } finally {
      setBusy(null);
    }
  };

  const submitTracking = (event: FormEvent) => {
    event.preventDefault();
    void run("shipment", () => postJson(`${base}/shipment`, { carrier, tracking_number: trackingNumber }));
  };

  const submitDispute = (event: FormEvent) => {
    event.preventDefault();
    void run("dispute", () => postJson(`${base}/disputes`, { reason_code: reason, notes: notes || null }));
  };

  const submitStatement = (event: FormEvent) => {
    event.preventDefault();
    if (!disputeId) return;
    void run("statement", async () => {
      await postJson(`/api/v1/disputes/${encodeURIComponent(disputeId)}/statement`, { statement });
      setStatement("");
    });
  };

  const submitFile = () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !disputeId) return;
    if (!EVIDENCE_CONTENT_TYPES.includes(file.type)) {
      setActionError(t("errors.fileType"));
      return;
    }
    void run("evidence", async () => {
      await uploadEvidenceFile(disputeId, file);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const actions = order?.actions || {};
  const roles: string[] = order?.viewer_roles || [];
  const notFound = fetchState === "error" && error?.status === 404;

  return (
    <div data-testid="order-detail-page" className="min-h-screen bg-bg">
      <PageHeader title={t("orderTitle")}>
        <AppNav current="orders" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full max-w-4xl px-4 py-6 space-y-6">
        <Link href="/my/orders" className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary">
          &larr; {t("back")}
        </Link>

        {(fetchState === "idle" || fetchState === "loading") && <SkeletonTable columns={2} rows={6} />}
        {fetchState === "error" && (
          <ErrorState
            message={notFound ? t("notFound") : error?.message || t("failedToLoadOrder")}
            onRetry={notFound ? undefined : () => reload()}
          />
        )}

        {fetchState === "done" && order && (
          <>
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span data-testid="order-status" data-status={order.escrow.status}>
                  <Badge tone={escrowStatusTone(order.escrow.status)}>{t(`status.${order.escrow.status}`)}</Badge>
                </span>
                {roles.map((role) => (
                  <Badge key={role}>{t(`role.${role}`)}</Badge>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t("list.item")}>{order.terms?.listing?.title || t("untitled")}</Field>
                <Field label={t("list.amount")}>{formatMoney(order.escrow.amount_gross_minor, order.escrow.currency)}</Field>
              </div>
            </section>

            {(actionError || notice) && (
              <p
                role={actionError ? "alert" : "status"}
                data-testid={actionError ? "order-action-error" : "order-action-notice"}
                className={`border rounded clip-corner px-3 py-2 text-sm ${
                  actionError ? "border-error/40 bg-error/5 text-error-muted" : "border-secondary/40 bg-secondary/5 text-secondary"
                }`}
              >
                {actionError || notice}
              </p>
            )}

            <InspectionNotice inspection={order.inspection} escrowStatus={order.escrow.status} />

            {(actions.confirm_received || actions.open_dispute) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {actions.confirm_received && (
                  <Section title={t("confirm.title")} testId="order-confirm">
                    <p className="text-sm text-muted">{t("confirm.help")}</p>
                    <button
                      type="button"
                      data-testid="order-confirm-submit"
                      disabled={busy !== null}
                      onClick={() => setConfirmOpen(true)}
                      className={PRIMARY_BUTTON}
                    >
                      {t("confirm.submit")}
                    </button>
                  </Section>
                )}

                {actions.open_dispute && (
                  <Section title={t("openDispute.title")} testId="order-open-dispute">
                    <p className="text-sm text-muted">{t("openDispute.help")}</p>
                    <form onSubmit={submitDispute} className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-mono text-subtle uppercase tracking-wider">{t("openDispute.reasonLabel")}</span>
                        <select
                          data-testid="order-dispute-reason"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          className={INPUT}
                        >
                          {REASONS.map((code) => (
                            <option key={code} value={code}>
                              {t(`reasons.${code}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-mono text-subtle uppercase tracking-wider">{t("openDispute.notesLabel")}</span>
                        <textarea
                          data-testid="order-dispute-notes"
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          maxLength={500}
                          rows={3}
                          className={INPUT}
                        />
                      </label>
                      <button type="submit" data-testid="order-dispute-submit" disabled={busy !== null} className={DANGER_BUTTON}>
                        {t("openDispute.submit")}
                      </button>
                    </form>
                  </Section>
                )}
              </div>
            )}

            {order.dispute && (
              <Section title={t("dispute.title")} testId="order-dispute">
                <p className="text-sm text-muted">{t("dispute.reviewerNote")}</p>
                <DisputeSummary dispute={order.dispute} />

                {actions.submit_statement && (
                  <form onSubmit={submitStatement} className="space-y-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-mono text-subtle uppercase tracking-wider">{t("dispute.statementLabel")}</span>
                      <textarea
                        data-testid="order-statement-input"
                        value={statement}
                        onChange={(event) => setStatement(event.target.value)}
                        maxLength={2000}
                        rows={4}
                        required
                        className={INPUT}
                      />
                    </label>
                    <p className="text-xs text-subtle">{t("dispute.statementHelp")}</p>
                    <button type="submit" data-testid="order-statement-submit" disabled={busy !== null} className={PRIMARY_BUTTON}>
                      {t("dispute.statementSubmit")}
                    </button>
                  </form>
                )}

                <div className="space-y-3">
                  <p className="text-xs font-mono text-subtle uppercase tracking-wider">{t("dispute.evidence")}</p>
                  {evidenceError && <ErrorState message={t("errors.evidenceLoad")} onRetry={() => void loadEvidence()} />}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {["BUYER", "SELLER"].map((side) => (
                      <div key={side} className="space-y-2">
                        <p className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{t(`dispute.party.${side}`)}</p>
                        <EvidenceList
                          testId={`order-evidence-${side.toLowerCase()}`}
                          items={evidence.filter((item) => item.submitted_by === side)}
                          fileBase={`/api/v1/disputes/${encodeURIComponent(order.dispute.dispute_id)}/evidence`}
                        />
                      </div>
                    ))}
                  </div>

                  {actions.submit_evidence && (
                    <div className="space-y-2">
                      <p className="text-xs text-subtle">{t("dispute.evidenceHelp")}</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          ref={fileRef}
                          type="file"
                          data-testid="order-evidence-file"
                          accept={EVIDENCE_CONTENT_TYPES.join(",")}
                          aria-label={t("dispute.evidenceUpload")}
                          className="text-sm text-muted"
                        />
                        <button
                          type="button"
                          data-testid="order-evidence-submit"
                          disabled={busy !== null}
                          onClick={submitFile}
                          className={PRIMARY_BUTTON}
                        >
                          {busy === "evidence" ? t("dispute.uploading") : t("dispute.evidenceUpload")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            <TrackingCard shipment={order.shipment}>
              {actions.register_shipment && (
                <form onSubmit={submitTracking} data-testid="order-tracking-form" className="space-y-3 border-t border-border pt-4">
                  <p className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{t("tracking.register.title")}</p>
                  <p className="text-sm text-muted">{t("tracking.register.help")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-mono text-subtle uppercase tracking-wider">{t("tracking.register.carrierLabel")}</span>
                      <select
                        data-testid="order-tracking-carrier"
                        value={carrier}
                        onChange={(event) => setCarrier(event.target.value)}
                        className={INPUT}
                      >
                        {CARRIERS.map((code) => (
                          <option key={code} value={code}>
                            {t(`tracking.carriers.${code}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-mono text-subtle uppercase tracking-wider">{t("tracking.register.numberLabel")}</span>
                      <input
                        data-testid="order-tracking-number"
                        value={trackingNumber}
                        onChange={(event) => setTrackingNumber(event.target.value)}
                        required
                        minLength={6}
                        maxLength={48}
                        autoComplete="off"
                        className={INPUT}
                      />
                    </label>
                  </div>
                  <button type="submit" data-testid="order-tracking-submit" disabled={busy !== null} className={PRIMARY_BUTTON}>
                    {t("tracking.register.submit")}
                  </button>
                </form>
              )}

              {actions.mark_delivered && (
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{t("tracking.handover.title")}</p>
                  <p className="text-sm text-muted">{t("tracking.handover.help")}</p>
                  <button
                    type="button"
                    data-testid="order-handover-submit"
                    disabled={busy !== null}
                    onClick={() => void run("handover", () => postJson(`${base}/mark-delivered`))}
                    className={PRIMARY_BUTTON}
                  >
                    {t("tracking.handover.submit")}
                  </button>
                </div>
              )}
            </TrackingCard>

            <TermsCard terms={order.terms} />
          </>
        )}
      </main>
      <ConfirmModal
        open={confirmOpen}
        title={t("confirm.title")}
        message={t("confirm.help")}
        confirmLabel={t("confirm.submit")}
        cancelLabel={t("cancel")}
        loading={busy === "confirm"}
        onConfirm={() => void run("confirm", async () => {
          await postJson(`${base}/confirm-received`);
          setConfirmOpen(false);
        })}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
