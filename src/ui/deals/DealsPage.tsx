import { useCallback } from "react";
import { useDeals } from "./useDeals";
import { useVote } from "./useVote";
import DealsToolbar from "./DealsToolbar";
import DealsList from "./DealsList";
import VoteModal from "./VoteModal";
import PageHeader from "../shared/PageHeader";
import AppNav from "../shared/AppNav";

export default function DealsPage() {
  const {
    deals, sort, setSort, statuses, setStatuses, tags, setTags, q, setQ,
    nextCursor, fetchState, loadMoreState, error, loadMore, updateDealInList,
    refetch
  } = useDeals();

  const {
    isOpen,
    targetDeal,
    direction,
    submitState,
    error: voteError,
    retryIn,
    openVote,
    closeVote,
    submitVote
  } = useVote({ onVoteSuccess: updateDealInList });

  const handleVote = useCallback((deal, dir) => {
    openVote(deal, dir);
  }, [openVote]);

  const handleTagRemove = useCallback((tag) => {
    setTags(tags.filter((t) => t !== tag));
  }, [setTags, tags]);

  return (
    <div data-testid="deals-page" className="min-h-screen bg-bg">
      {/* Header */}
      <PageHeader title="DEALS">
        <AppNav current="listings" />
      </PageHeader>

      {/* Main content */}
      <main id="main-content" tabIndex={-1} className="px-4 py-6 space-y-6">
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
          retryIn={retryIn}
          onRetry={refetch}
          onLoadMore={loadMore}
          onVote={handleVote}
        />
      </main>

      {/* Vote Modal */}
      {isOpen && (
        <VoteModal
          isOpen={isOpen}
          targetDeal={targetDeal}
          direction={direction}
          submitState={submitState}
          error={voteError}
          retryIn={retryIn}
          onClose={closeVote}
          onSubmit={submitVote}
        />
      )}
    </div>
  );
}
