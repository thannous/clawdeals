import { memo } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import BrowseDealCard from "./BrowseDealCard";

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded clip-corner animate-pulse flex flex-col overflow-hidden">
      {/* Image placeholder */}
      <div className="h-48 bg-surface-alt" />
      {/* Content placeholder */}
      <div className="p-4 flex flex-col gap-2.5">
        <div className="h-5 w-20 bg-surface-alt rounded" />
        <div className="space-y-1.5">
          <div className="h-4 w-full bg-surface-alt rounded" />
          <div className="h-4 w-2/3 bg-surface-alt rounded" />
        </div>
        <div className="h-3 w-28 bg-surface-alt rounded" />
        <div className="flex gap-1">
          <div className="h-5 w-16 bg-surface-alt rounded" />
          <div className="h-5 w-12 bg-surface-alt rounded" />
        </div>
        <div className="mt-auto pt-3 border-t border-dashed border-border flex flex-col gap-3">
          <div className="flex justify-between">
            <div className="h-5 w-24 bg-surface-alt rounded" />
            <div className="flex gap-2">
              <div className="h-4 w-8 bg-surface-alt rounded" />
              <div className="h-4 w-8 bg-surface-alt rounded" />
            </div>
          </div>
          <div className="h-9 w-full bg-surface-alt rounded" />
        </div>
      </div>
    </div>
  );
}

function BrowseDealCardGrid({
  deals,
  fetchState,
  loadMoreState,
  error,
  nextCursor,
  onRetry,
  onLoadMore,
  onResetFilters,
}: {
  deals: any[];
  fetchState: string;
  loadMoreState: string;
  error: string | null;
  nextCursor: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  onResetFilters?: () => void;
}) {
  const t = useTranslations("browseDeals");

  if (fetchState === "loading") {
    return (
      <div data-testid="browse-deals-loading" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (fetchState === "error") {
    return (
      <div data-testid="browse-deals-error" className="border border-error/40 bg-error/5 rounded clip-corner p-6 text-center">
        <AlertTriangle size={24} className="mx-auto mb-2 text-error" />
        <p className="text-sm text-error-muted mb-3">{error || t("error")}</p>
        <button
          data-testid="browse-deals-retry"
          onClick={onRetry}
          className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (fetchState === "done" && deals.length === 0) {
    return (
      <div data-testid="browse-deals-empty" className="border border-border bg-surface rounded clip-corner p-8 text-center">
        <Inbox size={32} className="mx-auto mb-3 text-subtle" />
        <p className="text-sm text-muted mb-1">{t("noResults")}</p>
        <p className="text-xs text-subtle mb-4">{t("noResultsHint")}</p>
        {onResetFilters && (
          <button
            data-testid="browse-deals-reset-filters"
            onClick={onResetFilters}
            className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
          >
            {t("resetFilters")}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {deals.length > 0 && (
        <p className="text-xs font-mono text-subtle mb-3">
          {t("results", { count: deals.length })}
        </p>
      )}
      <div data-testid="browse-deals-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {deals.map((deal) => (
          <BrowseDealCard key={deal.deal_id} deal={deal} />
        ))}
      </div>

      {nextCursor && (
        <div className="flex justify-center pt-6">
          <button
            data-testid="browse-deals-load-more"
            onClick={onLoadMore}
            disabled={loadMoreState === "loading"}
            className="px-6 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-primary hover:text-primary disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loadMoreState === "loading" && <Loader2 size={14} className="animate-spin" />}
            {loadMoreState === "loading" ? t("loading") : t("loadMore")}
          </button>
        </div>
      )}
    </>
  );
}

export default memo(BrowseDealCardGrid);
