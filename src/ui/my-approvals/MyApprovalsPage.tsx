import Link from "next/link";
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
import { approvalActionLabelKey, unrecognizedApprovalAction } from "./approvalActionLabel";

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

  const { execute, submitState, error: actionError, activeApprovalId, pending } = useMyApprovalAction({ onSuccess: refetch });

  const columns: Column[] = [
    {
      key: "action_type",
      label: t("list.action"),
      cell: (row: any) => {
        const rawType = unrecognizedApprovalAction(row.action_type);
        return <span className="block min-w-24 max-w-48 whitespace-normal break-words text-sm font-medium">
          {t(approvalActionLabelKey(row.action_type))}
          {rawType ? <code className="mt-1 block break-all text-xs text-subtle">{rawType}</code> : null}
        </span>;
      },
    },
    {
      key: "action_ref_id",
      label: t("list.reference"),
      className: "hidden sm:table-cell",
      cell: (row: any) => row.action_ref_id ? <TruncatedId id={row.action_ref_id} /> : <span className="text-subtle">-</span>,
    },
    {
      key: "state",
      label: t("list.state"),
      cell: (row: any) => <div className="max-w-24 whitespace-normal break-words"><ConsoleStatusBadge value={row.state} label={t(`toolbar.state_${row.state}`)} variant="approval" /></div>,
    },
    {
      key: "agent",
      label: t("list.agent"),
      className: "hidden md:table-cell",
      cell: (row: any) => <span className="block max-w-44 whitespace-normal break-words text-xs font-mono text-subtle">{row.created_by_agent_id ? (agentMap[row.created_by_agent_id] || "\u2014") : "-"}</span>,
    },
    {
      key: "created_at",
      label: t("list.created"),
      className: "hidden lg:table-cell",
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>,
    },
    {
      key: "resolved_at",
      label: t("list.decided"),
      className: "hidden xl:table-cell",
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{row.resolved_at ? formatDate(row.resolved_at) : "-"}</span>,
    },
    {
      key: "actions",
      label: "",
      cell: (row: any) => {
        if (row.state !== "PENDING") return null;
        return (
          <span className="flex max-w-44 flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={submitState === "loading" || Boolean(pending)}
              onClick={(e) => {
                e.stopPropagation();
                execute(row.approval_id, "approve", {}, row.owner_id);
              }}
              className="px-2 py-1 text-[11px] font-mono font-bold uppercase border border-success/50 text-success hover:bg-success/10 transition-colors disabled:opacity-50"
            >
              {t("list.approve")}
            </button>
            <button
              type="button"
              disabled={submitState === "loading" || Boolean(pending)}
              onClick={(e) => {
                e.stopPropagation();
                execute(row.approval_id, "deny", {}, row.owner_id);
              }}
              className="px-2 py-1 text-[11px] font-mono font-bold uppercase border border-error/50 text-error hover:bg-error/10 transition-colors disabled:opacity-50"
            >
              {t("list.deny")}
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <div data-testid="my-approvals-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="approvals" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <MyApprovalsToolbar state={state} onStateChange={setState} agents={agents} selectedAgentId={agentId} onAgentChange={setAgentId} />

        {actionError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-error">{actionError}</p>
            {activeApprovalId && <Link href={`/my/approvals/${activeApprovalId}`} className="text-sm text-primary underline">{t("detail.recovery.openApproval")}</Link>}
          </div>
        )}

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
              onRowClick={(row) => router.push(`/my/approvals/${row.approval_id}`)}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
