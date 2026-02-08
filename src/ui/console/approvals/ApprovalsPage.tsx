import { useApprovals } from "./useApprovals";
import ApprovalsToolbar from "./ApprovalsToolbar";
import ApprovalsList from "./ApprovalsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";

export default function ApprovalsPage() {
  const {
    items,
    state, setState,
    actionType, setActionType,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useApprovals();

  return (
    <div data-testid="approvals-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>APPROVALS
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ApprovalsToolbar
          state={state}
          onStateChange={setState}
          actionType={actionType}
          onActionTypeChange={setActionType}
          agentId={agentId}
          onAgentIdChange={setAgentId}
        />

        {fetchState === "loading" && <SkeletonTable columns={7} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load approvals"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No approvals found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <ApprovalsList items={items} />
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
