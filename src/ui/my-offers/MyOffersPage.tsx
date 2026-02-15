import { useTranslations } from "next-intl";
import { useMyOffers } from "./useMyOffers";
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

const STATUS_OPTIONS = ["CREATED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"];

export default function MyOffersPage() {
  const t = useTranslations("myOffers");
  const {
    items, status, setStatus,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useMyOffers();

  const columns: Column[] = [
    { key: "listing_id", label: t("list.listing") },
    { key: "amount", label: t("list.amount") },
    { key: "status", label: t("list.status") },
    { key: "created_at", label: t("list.created") },
  ];

  function renderCell(row: any, col: Column) {
    switch (col.key) {
      case "listing_id":
        return row.listing_id ? <TruncatedId id={row.listing_id} /> : <span className="text-subtle">-</span>;
      case "amount":
        return <span className="text-sm font-mono">{row.amount != null ? `${row.amount} ${row.currency || ""}` : "-"}</span>;
      case "status":
        return <ConsoleStatusBadge value={row.status} variant="listing" />;
      case "created_at":
        return <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>;
      default:
        return row[col.key];
    }
  }

  return (
    <div data-testid="my-offers-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="offers" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        {/* Status toolbar */}
        <div data-testid="my-offers-toolbar" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-mono text-subtle uppercase mr-1">{t("toolbar.statusLabel")}</span>
            <button
              onClick={() => setStatus(null)}
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
                !status ? "border-primary/40 text-primary bg-primary/10" : "border-border text-subtle hover:border-border-strong"
              }`}
            >
              {t("toolbar.all")}
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? null : s)}
                className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
                  status === s ? "border-primary/40 text-primary bg-primary/10" : "border-border text-subtle hover:border-border-strong"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {fetchState === "loading" && <SkeletonTable columns={4} rows={10} />}
        {fetchState === "error" && <ErrorState message={error || t("failedToLoad")} onRetry={refetch} />}
        {fetchState === "done" && items.length === 0 && (
          <EmptyState
            title={status ? t("noOffers") : t("noOffersYet")}
            subtitle={status ? t("adjustFilters") : t("noOffersHint")}
          />
        )}
        {fetchState === "done" && items.length > 0 && (
          <>
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.offer_id}
              renderCell={renderCell}
            />
            <Pagination nextCursor={nextCursor} loading={loadMoreState === "loading"} onLoadMore={loadMore} />
          </>
        )}
      </main>
    </div>
  );
}
