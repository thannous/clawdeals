import { useListings } from "./useListings";
import ListingsToolbar from "./ListingsToolbar";
import ListingsList from "./ListingsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";

export default function ListingsPage() {
  const {
    items, sort, setSort, status, setStatus, condition, setCondition,
    q, setQ, priceMin, setPriceMin, priceMax, setPriceMax,
    nextCursor, fetchState, loadMoreState, error, loadMore, refetch,
  } = useListings();

  return (
    <div data-testid="listings-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>LISTINGS
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ListingsToolbar
          sort={sort}
          onSortChange={setSort}
          status={status}
          onStatusChange={setStatus}
          condition={condition}
          onConditionChange={setCondition}
          q={q}
          onSearchChange={setQ}
          priceMin={priceMin}
          onPriceMinChange={setPriceMin}
          priceMax={priceMax}
          onPriceMaxChange={setPriceMax}
        />

        {fetchState === "loading" && <SkeletonTable columns={8} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load listings"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No listings found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <ListingsList items={items} />
            <Pagination
              nextCursor={nextCursor}
              loading={loadMoreState === "loading"}
              onLoadMore={loadMore}
            />
          </>
        )}
      </main>
    </div>
  );
}
