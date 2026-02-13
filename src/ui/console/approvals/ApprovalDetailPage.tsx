import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApprovalDetail } from "./useApprovalDetail";
import { useApprovalAction } from "./useApprovalAction";
import ApprovalContextPreview from "./ApprovalContextPreview";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import ConfirmModal from "../shared/ConfirmModal";
import ToastContainer from "../shared/Toast";
import { useToast } from "../shared/useToast";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import { formatDate } from "../shared/formatDate";
import PageHeader from "../../shared/PageHeader";

export default function ApprovalDetailPage() {
  const router = useRouter();
  const approvalId = useMemo(() => {
    const raw = router.query.approval_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.approval_id]);

  const { approval, fetchState, error, refetch } = useApprovalDetail({ approvalId });
  const toast = useToast();

  const action = useApprovalAction({
    approvalId,
    onSuccess: () => {
      toast.show("Action completed successfully", "success");
      refetch();
    },
  });

  const [confirmAction, setConfirmAction] = useState<"approve" | "deny" | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const handleConfirm = () => {
    if (confirmAction) {
      const reason = confirmAction === "deny" && denyReason.trim() ? denyReason.trim() : undefined;
      action.execute(confirmAction, reason);
      setConfirmAction(null);
      setDenyReason("");
    }
  };

  const handleCancel = () => {
    setConfirmAction(null);
    setDenyReason("");
  };

  const isPending = approval?.state === "PENDING";

  return (
    <div data-testid="approval-detail-page" className="min-h-screen bg-bg">
      <PageHeader
        left={
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/console/approvals"
              className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary transition-colors"
            >
              &larr; Back
            </Link>
            <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
              <span className="text-primary">/ </span>APPROVAL
            </h1>
          </div>
        }
      />

      <main id="main-content" tabIndex={-1} className="px-4 py-6 space-y-6">
        {fetchState === "loading" && <SkeletonTable columns={4} rows={6} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load approval"} onRetry={() => router.reload()} />}

        {fetchState === "done" && approval && (
          <>
            {/* Metadata */}
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <ConsoleStatusBadge value={approval.state} variant="approval" />
                {approval.action_type && (
                  <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
                    {approval.action_type}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Approval ID</span>
                  <TruncatedId id={approval.approval_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Agent</span>
                  <TruncatedId id={approval.created_by_agent_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Owner</span>
                  <TruncatedId id={approval.owner_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Created</span>
                  <span className="text-text tabular-nums">{formatDate(approval.created_at)}</span>
                </div>
                {approval.resolved_at && (
                  <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-subtle uppercase tracking-wider">Resolved</span>
                    <span className="text-text tabular-nums">{formatDate(approval.resolved_at)}</span>
                  </div>
                )}
                {approval.resolved_by_human_id && (
                  <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-subtle uppercase tracking-wider">Resolved by</span>
                    <TruncatedId id={approval.resolved_by_human_id} />
                  </div>
                )}
              </div>

              {approval.resolved_reason_text && (
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2">
                  <span className="text-subtle uppercase tracking-wider text-xs font-mono block mb-1">Reason</span>
                  <p className="text-xs font-mono text-text whitespace-pre-wrap">{approval.resolved_reason_text}</p>
                </div>
              )}
            </section>

            {/* Context preview */}
            <section className="border border-border bg-surface rounded clip-corner p-5">
              <h3 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-3">
                Action Context
              </h3>
              <ApprovalContextPreview
                actionType={approval.action_type}
                payload={approval.action_payload_redacted}
                actionRef={approval.action_ref}
              />
            </section>

            {/* Action error */}
            {action.error && (
              <div className="border border-error/40 bg-error/5 rounded clip-corner p-4">
                <p className="text-xs text-error-muted font-mono">{action.error}</p>
              </div>
            )}

            {/* Approve / Deny buttons */}
            {isPending && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfirmAction("approve")}
                  disabled={action.submitState === "loading"}
                  className="px-6 py-2.5 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => setConfirmAction("deny")}
                  disabled={action.submitState === "loading"}
                  className="px-6 py-2.5 text-xs font-mono font-bold uppercase border border-error text-error rounded hover:bg-error/10 disabled:opacity-50 transition-colors"
                >
                  Deny
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmAction !== null}
        title={confirmAction === "approve" ? "Approve this action?" : "Deny this action?"}
        message={
          confirmAction === "approve"
            ? "This will approve the pending action and allow it to proceed."
            : "This will deny the pending action. The requesting agent will be notified."
        }
        confirmLabel={confirmAction === "approve" ? "Approve" : "Deny"}
        variant={confirmAction === "approve" ? "success" : "danger"}
        loading={action.submitState === "loading"}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      >
        {confirmAction === "deny" && (
          <div className="space-y-1">
            <label className="text-xs font-mono text-subtle uppercase tracking-wider" htmlFor="approval-deny-reason">
              Reason (optional)
            </label>
            <textarea
              id="approval-deny-reason"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Why is this being denied?"
              name="deny_reason"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors resize-none"
            />
          </div>
        )}
      </ConfirmModal>

      {/* Toast */}
      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
