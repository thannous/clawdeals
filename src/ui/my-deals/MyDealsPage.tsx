import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMyDeals } from "./useMyDeals";
import MyDealsToolbar from "./MyDealsToolbar";
import ConsoleTable, { type Column } from "../console/shared/ConsoleTable";
import Pagination from "../console/shared/Pagination";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import SkeletonTable from "../console/shared/SkeletonTable";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import TemperatureGauge from "../deals/TemperatureGauge";
import { formatDate } from "../console/shared/formatDate";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { useOwnerAgents } from "../shared/useOwnerAgents";

function formatPrice(amount: number, currency?: string): string {
  return `${amount.toFixed(2)} ${currency || ""}`.trim();
}

export default function MyDealsPage() {
  const t = useTranslations("myDeals");
  const {
    items, status, setStatus,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch, resetFilters,
  } = useMyDeals();
  const { agents, agentMap } = useOwnerAgents();

  const columns: Column[] = [
    {
      key: "title",
      label: t("list.title"),
      cell: (row: any) => (
        <Link href={`/browse/deals/${row.deal_id}`} data-testid="my-deals-item-link"
          title={row.title} className="text-sm font-medium text-primary hover:underline whitespace-normal break-words max-w-[140px] sm:max-w-[300px] sm:truncate block">
          {row.title || "-"}
        </Link>
      ),
    },
    {
      key: "status",
      label: t("list.status"),
      cell: (row: any) => <ConsoleStatusBadge value={row.status} label={t(`toolbar.status_${row.status}`)} />,
    },
    {
      key: "temperature",
      className: "hidden sm:table-cell",
      label: t("list.temperature"),
      cell: (row: any) => <TemperatureGauge temperature={row.temperature} status={row.status} />,
    },
    {
      key: "price",
      label: t("list.price"),
      cell: (row: any) => <span className="text-sm font-mono">{row.price != null ? formatPrice(row.price, row.currency) : "-"}</span>,
    },
    {
      key: "agent",
      className: "hidden sm:table-cell",
      label: t("list.agent"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{row.creator_agent_id ? (agentMap[row.creator_agent_id] || "\u2014") : "-"}</span>,
    },
    {
      key: "created_at",
      className: "hidden sm:table-cell",
      label: t("list.created"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>,
    },
  ];

  return (
    <div data-testid="my-deals-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="deals" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <MyDealsToolbar status={status} onStatusChange={setStatus} agents={agents} selectedAgentId={agentId} onAgentChange={setAgentId} />

        {fetchState === "loading" && <SkeletonTable columns={6} rows={10} />}
        {fetchState === "error" && <ErrorState message={error || t("failedToLoad")} onRetry={refetch} />}
        {fetchState === "done" && items.length === 0 && (
          <div className="text-center">
            <EmptyState title={t("noDeals")} subtitle={status || agentId ? t("adjustFilters") : t("noDealsHint")} />
            {status || agentId ? (
              <button type="button" onClick={resetFilters} data-testid="my-deals-clear-filters"
                className="inline-flex min-h-11 items-center justify-center px-4 py-2 border border-primary text-primary hover:bg-primary/10 text-sm font-semibold">
                {t("clearFilters")}
              </button>
            ) : (
              <Link href="/browse/deals" data-testid="my-deals-empty-browse" className="inline-flex min-h-11 items-center justify-center px-4 py-2 border border-primary text-primary hover:bg-primary/10 text-sm font-semibold">
                {t("browseCatalog")}
              </Link>
            )}
          </div>
        )}
        {fetchState === "done" && items.length > 0 && (
          <>
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.deal_id}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
