import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import { useMyApprovals } from "./useMyApprovals";
import { useMyApprovalAction } from "./useMyApprovalAction";
import MyApprovalsToolbar from "./MyApprovalsToolbar";
import ConsoleTable, { type Column } from "../console/shared/ConsoleTable";
import Pagination from "../console/shared/Pagination";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import SkeletonTable from "../console/shared/SkeletonTable";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import TruncatedId from "../console/shared/TruncatedId";
import { formatDate } from "../console/shared/formatDate";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { useOwnerAgents } from "../shared/useOwnerAgents";

export default function MyApprovalsPage() {
  const t = useTranslations("myApprovals");
  const router = useRouter();
  const {
    items, state, setState,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useMyApprovals();
  const { agents, agentMap } = useOwnerAgents();

  const { execute, submitState } = useMyApprovalAction({ onSuccess: refetch });

  const columns: Column[] = [
    { key: "action_type", label: t("list.action") },
    { key: "action_ref_id", label: t("list.reference") },
    { key: "state", label: t("list.state") },
    { key: "agent", label: t("list.agent") },
    { key: "created_at", label: t("list.created") },
    { key: "resolved_at", label: t("list.decided") },
    { key: "actions", label: "" },
  ];

  function renderCell(row: any, col: Column) {
    switch (col.key) {
      case "action_type":
        return <span className="text-sm font-mono">{row.action_type || "-"}</span>;
      case "action_ref_id":
        return row.action_ref_id ? <TruncatedId id={row.action_ref_id} /> : <span className="text-subtle">-</span>;
      case "state":
        return <ConsoleStatusBadge value={row.state} label={t(`toolbar.state_${row.state}`)} variant="approval" />;
      case "agent":
        return <span className="text-xs font-mono text-subtle">{row.created_by_agent_id ? (agentMap[row.created_by_agent_id] || "\u2014") : "-"}</span>;
      case "created_at":
        return <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>;
      case "resolved_at":
        return <span className="text-xs font-mono text-subtle">{row.resolved_at ? formatDate(row.resolved_at) : "-"}</span>;
      case "actions":
        if (row.state !== "PENDING") return null;
        return (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={submitState === "loading"}
              onClick={(e) => {
                e.stopPropagation();
                execute(row.approval_id, "approve");
              }}
              className="px-2 py-1 text-[11px] font-mono font-bold uppercase border border-success/50 text-success hover:bg-success/10 transition-colors disabled:opacity-50"
            >
              {t("list.approve")}
            </button>
            <button
              type="button"
              disabled={submitState === "loading"}
              onClick={(e) => {
                e.stopPropagation();
                execute(row.approval_id, "deny");
              }}
              className="px-2 py-1 text-[11px] font-mono font-bold uppercase border border-error/50 text-error hover:bg-error/10 transition-colors disabled:opacity-50"
            >
              {t("list.deny")}
            </button>
          </span>
        );
      default:
        return row[col.key];
    }
  }

  return (
    <div data-testid="my-approvals-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="approvals" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <MyApprovalsToolbar state={state} onStateChange={setState} agents={agents} selectedAgentId={agentId} onAgentChange={setAgentId} />

        {fetchState === "loading" && <SkeletonTable columns={6} rows={10} />}
        {fetchState === "error" && <ErrorState message={error || t("failedToLoad")} onRetry={refetch} />}
        {fetchState === "done" && items.length === 0 && (
          <EmptyState title={t("noApprovals")} subtitle={t("adjustFilters")} />
        )}
        {fetchState === "done" && items.length > 0 && (
          <>
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.approval_id}
              renderCell={renderCell}
              onRowClick={(row) => router.push(`/my/approvals/${row.approval_id}`)}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
