import { memo } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import DealCard from "./DealCard";

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded clip-corner animate-pulse flex flex-col md:flex-row overflow-hidden">
      {/* Image placeholder */}
      <div className="h-40 md:h-auto md:w-[180px] bg-surface-alt shrink-0" />
      {/* Content placeholder */}
      <div className="flex-1 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-surface-alt rounded" />
          <div className="h-3 w-24 bg-surface-alt rounded" />
          <div className="h-3 w-8 bg-surface-alt rounded ml-auto" />
        </div>
        <div className="h-5 w-3/4 bg-surface-alt rounded" />
        <div className="h-4 w-1/2 bg-surface-alt rounded" />
        <div className="flex gap-1">
          <div className="h-5 w-14 bg-surface-alt rounded" />
          <div className="h-5 w-10 bg-surface-alt rounded" />
        </div>
        <div className="flex items-center gap-3 mt-auto pt-2">
          <div className="h-6 w-24 bg-surface-alt rounded" />
          <div className="h-8 w-24 bg-surface-alt rounded ml-auto" />
        </div>
      </div>
      {/* Sidebar placeholder — desktop */}
      <div className="hidden md:flex flex-col items-center justify-center gap-3 p-4 border-l border-border w-[90px]">
        <div className="h-8 w-8 bg-surface-alt rounded" />
        <div className="h-3 w-6 bg-surface-alt rounded" />
        <div className="h-3 w-6 bg-surface-alt rounded" />
        <div className="h-8 w-8 bg-surface-alt rounded" />
        <div className="h-7 w-14 bg-surface-alt rounded mt-1" />
      </div>
    </div>
  );
}

function DealsList({ deals, fetchState, loadMoreState, error, nextCursor, retryIn, onRetry, onLoadMore, onVote }) {
  if (fetchState === "loading") {
    return (
      <div data-testid="deals-loading" className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (fetchState === "error") {
    return (
      <div data-testid="deals-error" className="border border-error/40 bg-error/5 rounded clip-corner p-6 text-center">
        <AlertTriangle size={24} className="mx-auto mb-2 text-error" />
        <p className="text-sm text-error-muted mb-3">{error || "Failed to load deals"}</p>
        <button
          data-testid="retry-btn"
          onClick={onRetry}
          className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (fetchState === "done" && deals.length === 0) {
    return (
      <div data-testid="deals-empty" className="border border-border bg-surface rounded clip-corner p-8 text-center">
        <Inbox size={32} className="mx-auto mb-3 text-subtle" />
        <p className="text-sm text-muted mb-1">No deals found</p>
        <p className="text-xs text-subtle">Try adjusting your filters or search query</p>
      </div>
    );
  }

  return (
    <div data-testid="deals-list" className="space-y-2">
      {deals.map((deal) => (
        <DealCard key={deal.deal_id} deal={deal} retryIn={retryIn} onVote={onVote} />
      ))}

      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            data-testid="load-more-btn"
            onClick={onLoadMore}
            disabled={loadMoreState === "loading"}
            className="px-6 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-primary hover:text-primary disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loadMoreState === "loading" && <Loader2 size={14} className="animate-spin" />}
            {loadMoreState === "loading" ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(DealsList);
