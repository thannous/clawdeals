import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useReportDetail } from "./useReportDetail";
import { useReportAction } from "./useReportAction";
import ReportActionModal from "./ReportActionModal";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import ToastContainer from "../shared/Toast";
import { useToast } from "../shared/useToast";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import { formatDate } from "../shared/formatDate";

export default function ReportDetailPage() {
  const router = useRouter();
  const reportId = useMemo(() => {
    const raw = router.query.report_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.report_id]);

  const { report, fetchState, error, refetch } = useReportDetail({ reportId });
  const toast = useToast();

  const action = useReportAction({
    reportId,
    onSuccess: () => {
      toast.show("Action completed successfully", "success");
      refetch();
    },
  });

  const [modalAction, setModalAction] = useState<"confirm" | "reject" | null>(null);

  const handleSubmit = (reason: string) => {
    if (modalAction) {
      action.execute(modalAction, reason);
      setModalAction(null);
    }
  };

  const isUnconfirmed = report?.status === "UNCONFIRMED";

  return (
    <div data-testid="report-detail-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href="/console/reports"
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary transition-colors"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>REPORT
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="px-4 py-6 space-y-6">
        {fetchState === "loading" && <SkeletonTable columns={4} rows={6} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load report"} onRetry={() => router.reload()} />}

        {fetchState === "done" && report && (
          <>
            {/* Metadata */}
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <ConsoleStatusBadge value={report.status} variant="report" />
                {report.entity_type && (
                  <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
                    {report.entity_type}
                  </span>
                )}
                {report.reason_code && (
                  <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
                    {report.reason_code}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Report ID</span>
                  <TruncatedId id={report.report_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Entity Type</span>
                  <span className="text-text">{report.entity_type || "\u2014"}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Entity ID</span>
                  <TruncatedId id={report.entity_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Reporter Agent</span>
                  <TruncatedId id={report.reporter_agent_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Reporter Owner</span>
                  <TruncatedId id={report.reporter_owner_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Reason Code</span>
                  <span className="text-text">{report.reason_code || "\u2014"}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Report Weight</span>
                  <span className="text-text tabular-nums">{report.report_weight ?? "\u2014"}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Created</span>
                  <span className="text-text tabular-nums">{formatDate(report.created_at)}</span>
                </div>
              </div>
            </section>

            {/* Free text (redacted) */}
            {report.free_text_redacted && (
              <section className="border border-border bg-surface rounded clip-corner p-5">
                <h3 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-3">
                  Reporter Comment (Redacted)
                </h3>
                <p className="text-xs font-mono text-muted leading-relaxed whitespace-pre-wrap">
                  {report.free_text_redacted}
                </p>
              </section>
            )}

            {/* Resolution section */}
            {report.resolved_at && (
              <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
                <h3 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">
                  Resolution
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-subtle uppercase tracking-wider">Resolved By</span>
                    <TruncatedId id={report.resolved_by} />
                  </div>
                  <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-subtle uppercase tracking-wider">Resolved At</span>
                    <span className="text-text tabular-nums">{formatDate(report.resolved_at)}</span>
                  </div>
                  {report.resolved_reason && (
                    <div className="border border-border bg-bg rounded clip-corner px-3 py-2 sm:col-span-2">
                      <span className="text-subtle uppercase tracking-wider block mb-1">Reason</span>
                      <span className="text-text">{report.resolved_reason}</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Action error */}
            {action.error && (
              <div className="border border-error/40 bg-error/5 rounded clip-corner p-4">
                <p className="text-xs text-error-muted font-mono">{action.error}</p>
              </div>
            )}

            {/* Confirm / Reject buttons */}
            {isUnconfirmed && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setModalAction("confirm")}
                  disabled={action.submitState === "loading"}
                  className="px-6 py-2.5 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setModalAction("reject")}
                  disabled={action.submitState === "loading"}
                  className="px-6 py-2.5 text-xs font-mono font-bold uppercase border border-error text-error rounded hover:bg-error/10 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Action modal */}
      <ReportActionModal
        open={modalAction !== null}
        title={modalAction === "confirm" ? "Confirm this report?" : "Reject this report?"}
        message={
          modalAction === "confirm"
            ? "This will confirm the report and may trigger trust penalties on the reported entity."
            : "This will reject the report as invalid."
        }
        action={modalAction || "confirm"}
        loading={action.submitState === "loading"}
        onSubmit={handleSubmit}
        onCancel={() => setModalAction(null)}
      />

      {/* Toast */}
      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
