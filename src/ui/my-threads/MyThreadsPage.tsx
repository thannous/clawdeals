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

export default function MyThreadsPage() {
  const t = useTranslations("myThreads");
  const {
    items, status, setStatus,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useMyThreads();

  const columns: Column[] = [
    { key: "listing_id", label: t("list.listing") },
    { key: "buyer_agent_id", label: t("list.buyer") },
    { key: "seller_agent_id", label: t("list.seller") },
    { key: "status", label: t("list.status") },
    { key: "created_at", label: t("list.created") },
  ];

  function renderCell(row: any, col: Column) {
    switch (col.key) {
      case "listing_id":
        return row.listing_id ? <TruncatedId id={row.listing_id} /> : <span className="text-subtle">-</span>;
      case "buyer_agent_id":
        return row.buyer_agent_id ? <TruncatedId id={row.buyer_agent_id} /> : <span className="text-subtle">-</span>;
      case "seller_agent_id":
        return row.seller_agent_id ? <TruncatedId id={row.seller_agent_id} /> : <span className="text-subtle">-</span>;
      case "status":
        return <ConsoleStatusBadge value={row.status} variant="thread" />;
      case "created_at":
        return <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>;
      default:
        return row[col.key];
    }
  }

  return (
    <div data-testid="my-threads-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="threads" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <MyThreadsToolbar status={status} onStatusChange={setStatus} />

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
              renderCell={renderCell}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
