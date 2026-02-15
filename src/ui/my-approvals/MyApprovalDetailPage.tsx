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
      setApproval(data?.data || null);
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

  const { execute, submitState } = useMyApprovalAction({
    onSuccess: () => { if (approvalId) fetchApproval(approvalId); },
  });

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

            {/* Action buttons for PENDING */}
            {approval.state === "PENDING" && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={submitState === "loading"}
                  onClick={() => execute(approval.approval_id, "approve")}
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
