import { useTranslations } from "next-intl";
import { useMyThreads } from "./useMyThreads";
import MyThreadsToolbar from "./MyThreadsToolbar";
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

export default function MyThreadsPage() {
  const t = useTranslations("myThreads");
  const {
    items, status, setStatus,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useMyThreads();
  const { agents, agentMap } = useOwnerAgents();

  const columns: Column[] = [
    {
      key: "listing_id",
      label: t("list.listing"),
      className: "align-top",
      cell: (row: any) => (
        <div className="max-w-40 whitespace-normal [overflow-wrap:anywhere]">
          {row.listing_id ? <TruncatedId id={row.listing_id} /> : <span className="text-subtle">-</span>}
          <dl className="mt-3 space-y-2 text-xs font-mono text-subtle sm:hidden">
            <div>
              <dt>{t("list.buyer")}</dt>
              <dd title={row.buyer_agent_id}>{row.buyer_agent_id ? (agentMap[row.buyer_agent_id] || "\u2014") : "-"}</dd>
            </div>
            <div>
              <dt>{t("list.seller")}</dt>
              <dd title={row.seller_agent_id}>{row.seller_agent_id ? (agentMap[row.seller_agent_id] || "\u2014") : "-"}</dd>
            </div>
          </dl>
        </div>
      ),
    },
    {
      key: "buyer_agent_id",
      label: t("list.buyer"),
      className: "hidden align-top sm:table-cell",
      cell: (row: any) =>
        row.buyer_agent_id
          ? <span className="block max-w-64 whitespace-normal text-xs font-mono text-subtle [overflow-wrap:anywhere]" title={row.buyer_agent_id}>{agentMap[row.buyer_agent_id] || "\u2014"}</span>
          : <span className="text-subtle">-</span>,
    },
    {
      key: "seller_agent_id",
      label: t("list.seller"),
      className: "hidden align-top sm:table-cell",
      cell: (row: any) =>
        row.seller_agent_id
          ? <span className="block max-w-64 whitespace-normal text-xs font-mono text-subtle [overflow-wrap:anywhere]" title={row.seller_agent_id}>{agentMap[row.seller_agent_id] || "\u2014"}</span>
          : <span className="text-subtle">-</span>,
    },
    {
      key: "status",
      label: t("list.status"),
      className: "align-top",
      cell: (row: any) => <ConsoleStatusBadge value={row.status} label={t(`toolbar.status_${row.status}`)} variant="thread" />,
    },
    {
      key: "created_at",
      label: t("list.created"),
      className: "align-top",
      cell: (row: any) => <time dateTime={row.created_at} className="block max-w-24 whitespace-normal text-xs font-mono text-subtle sm:max-w-none sm:whitespace-nowrap">{formatDate(row.created_at)}</time>,
    },
  ];

  return (
    <div data-testid="my-threads-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="threads" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <MyThreadsToolbar status={status} onStatusChange={setStatus} agents={agents} selectedAgentId={agentId} onAgentChange={setAgentId} />

        {fetchState === "loading" && <SkeletonTable columns={5} rows={10} />}
        {fetchState === "error" && <ErrorState message={error || t("failedToLoad")} onRetry={refetch} />}
        {fetchState === "done" && items.length === 0 && (
          <EmptyState
            title={status ? t("noThreads") : t("noThreadsYet")}
            subtitle={status ? t("adjustFilters") : t("noThreadsHint")}
          />
        )}
        {fetchState === "done" && items.length > 0 && (
          <>
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.thread_id}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
