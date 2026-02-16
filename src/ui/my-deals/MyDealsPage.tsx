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
  return `${(amount / 100).toFixed(2)} ${currency || ""}`.trim();
}

export default function MyDealsPage() {
  const t = useTranslations("myDeals");
  const {
    items, status, setStatus,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useMyDeals();
  const { agents, agentMap } = useOwnerAgents();

  const columns: Column[] = [
    { key: "title", label: t("list.title") },
    { key: "status", label: t("list.status") },
    { key: "temperature", label: t("list.temperature") },
    { key: "price", label: t("list.price") },
    { key: "agent", label: t("list.agent") },
    { key: "created_at", label: t("list.created") },
  ];

  function renderCell(row: any, col: Column) {
    switch (col.key) {
      case "title":
        return <span title={row.title} className="text-sm font-medium text-text truncate max-w-[300px] block">{row.title || "-"}</span>;
      case "status":
        return <ConsoleStatusBadge value={row.status} label={t(`toolbar.status_${row.status}`)} />;
      case "temperature":
        return <TemperatureGauge temperature={row.temperature} status={row.status} />;
      case "price":
        return <span className="text-sm font-mono">{row.price != null ? formatPrice(row.price, row.currency) : "-"}</span>;
      case "agent":
        return <span className="text-xs font-mono text-subtle">{row.creator_agent_id ? (agentMap[row.creator_agent_id] || "\u2014") : "-"}</span>;
      case "created_at":
        return <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>;
      default:
        return row[col.key];
    }
  }

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
          <EmptyState
            title={t("noDeals")}
            subtitle={t("adjustFilters")}
          />
        )}
        {fetchState === "done" && items.length > 0 && (
          <>
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.deal_id}
              renderCell={renderCell}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
