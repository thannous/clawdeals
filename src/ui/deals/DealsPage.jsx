import { useDeals } from "./useDeals";
import { useVote } from "./useVote";
import DealsToolbar from "./DealsToolbar";
import DealsList from "./DealsList";
import VoteModal from "./VoteModal";

export default function DealsPage() {
  const {
    deals, sort, setSort, statuses, setStatuses, tags, setTags, q, setQ,
    nextCursor, fetchState, loadMoreState, error, loadMore, updateDealInList
  } = useDeals();

  const vote = useVote({ onVoteSuccess: updateDealInList });

  const handleVote = (deal, direction) => {
    vote.openVote(deal, direction);
  };

  const handleTagRemove = (tag) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleRetry = () => {
    // Trigger refetch by cycling sort back
    setSort(sort);
  };

  return (
    <div data-testid="deals-page" className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>DEALS
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <DealsToolbar
          sort={sort}
          onSortChange={setSort}
          statuses={statuses}
          onStatusChange={setStatuses}
          q={q}
          onSearchChange={setQ}
          tags={tags}
          onTagRemove={handleTagRemove}
        />

        <DealsList
          deals={deals}
          fetchState={fetchState}
          loadMoreState={loadMoreState}
          error={error}
          nextCursor={nextCursor}
          retryIn={vote.retryIn}
          onRetry={handleRetry}
          onLoadMore={loadMore}
          onVote={handleVote}
        />
      </main>

      {/* Vote Modal */}
      {vote.isOpen && (
        <VoteModal
          isOpen={vote.isOpen}
          targetDeal={vote.targetDeal}
          direction={vote.direction}
          submitState={vote.submitState}
          error={vote.error}
          retryIn={vote.retryIn}
          onClose={vote.closeVote}
          onSubmit={vote.submitVote}
        />
      )}
    </div>
  );
}
