import { useModerationActions } from "./useModerationActions";
import ModerationToolbar from "./ModerationToolbar";
import ModerationActionsList from "./ModerationActionsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";

export default function ModerationPage() {
  const {
    items,
    entityType, setEntityType,
    entityId, setEntityId,
    actionType, setActionType,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useModerationActions();

  return (
    <div data-testid="moderation-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>MODERATION
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ModerationToolbar
          actionType={actionType}
          onActionTypeChange={setActionType}
          entityType={entityType}
          onEntityTypeChange={setEntityType}
          entityId={entityId}
          onEntityIdChange={setEntityId}
        />

        {fetchState === "loading" && <SkeletonTable columns={6} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load moderation actions"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No moderation actions found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <ModerationActionsList items={items} />
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
