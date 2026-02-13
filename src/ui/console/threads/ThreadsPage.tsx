import { useThreads } from "./useThreads";
import ThreadsToolbar from "./ThreadsToolbar";
import ThreadsList from "./ThreadsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import PageHeader from "../../shared/PageHeader";

export default function ThreadsPage() {
  const {
    items,
    listingId, setListingId,
    buyerAgentId, setBuyerAgentId,
    sellerAgentId, setSellerAgentId,
    status, setStatus,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useThreads();

  return (
    <div data-testid="threads-page" className="min-h-screen bg-bg">
      <PageHeader title="THREADS" />

      <main id="main-content" tabIndex={-1} className="px-4 py-6 space-y-6">
        <ThreadsToolbar
          listingId={listingId}
          onListingIdChange={setListingId}
          buyerAgentId={buyerAgentId}
          onBuyerAgentIdChange={setBuyerAgentId}
          sellerAgentId={sellerAgentId}
          onSellerAgentIdChange={setSellerAgentId}
          status={status}
          onStatusChange={setStatus}
        />

        {fetchState === "loading" && <SkeletonTable columns={6} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load threads"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No threads found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <ThreadsList items={items} />
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
