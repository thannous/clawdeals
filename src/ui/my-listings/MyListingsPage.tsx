import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import { useMyListings } from "./useMyListings";
import MyListingsToolbar from "./MyListingsToolbar";
import ConsoleTable, { type Column } from "../console/shared/ConsoleTable";
import Pagination from "../console/shared/Pagination";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import SkeletonTable from "../console/shared/SkeletonTable";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import { formatDate } from "../console/shared/formatDate";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { useOwnerAgents } from "../shared/useOwnerAgents";

function formatPrice(amount: number, currency?: string): string {
  return `${(amount / 100).toFixed(2)} ${currency || ""}`.trim();
}

export default function MyListingsPage() {
  const t = useTranslations("myListings");
  const router = useRouter();
  const {
    items, status, setStatus,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useMyListings();
  const { agents, agentMap } = useOwnerAgents();

  const columns: Column[] = [
    { key: "title", label: t("list.title") },
    { key: "category", label: t("list.category") },
    { key: "price", label: t("list.price") },
    { key: "status", label: t("list.status") },
    { key: "agent", label: t("list.agent") },
    { key: "created_at", label: t("list.created") },
  ];

  function renderCell(row: any, col: Column) {
    switch (col.key) {
      case "title":
        return <span title={row.title} className="text-sm font-medium text-text truncate max-w-[300px] block">{row.title || "-"}</span>;
      case "category":
        return <span className="text-xs font-mono text-subtle">{row.category || "-"}</span>;
      case "price":
        return <span className="text-sm font-mono">{row.price_amount != null ? formatPrice(row.price_amount, row.currency) : "-"}</span>;
      case "status":
        return <ConsoleStatusBadge value={row.status} />;
      case "agent":
        return <span className="text-xs font-mono text-subtle">{row.seller_agent_id ? (agentMap[row.seller_agent_id] || "\u2014") : "-"}</span>;
      case "created_at":
        return <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>;
      default:
        return row[col.key];
    }
  }

  return (
    <div data-testid="my-listings-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="listings" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <MyListingsToolbar status={status} onStatusChange={setStatus} agents={agents} selectedAgentId={agentId} onAgentChange={setAgentId} />

        {fetchState === "loading" && <SkeletonTable columns={6} rows={10} />}
        {fetchState === "error" && <ErrorState message={error || t("failedToLoad")} onRetry={refetch} />}
        {fetchState === "done" && items.length === 0 && (
          <EmptyState
            title={t("noListings")}
            subtitle={t("adjustFilters")}
          />
        )}
        {fetchState === "done" && items.length > 0 && (
          <>
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.listing_id}
              renderCell={renderCell}
              onRowClick={(row) => router.push(`/my/listings/${row.listing_id}`)}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
