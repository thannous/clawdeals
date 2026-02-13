import { useListings } from "./useListings";
import ListingsToolbar from "./ListingsToolbar";
import ListingsList from "./ListingsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import PageHeader from "../../shared/PageHeader";

export default function ListingsPage() {
  const {
    items, sort, setSort, status, setStatus, condition, setCondition,
    q, setQ, priceMin, setPriceMin, priceMax, setPriceMax,
    nextCursor, fetchState, loadMoreState, error, loadMore, refetch,
  } = useListings();

  return (
    <div data-testid="listings-page" className="min-h-screen bg-bg">
      <PageHeader title="LISTINGS" />

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
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
