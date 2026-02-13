import { useModerationActions } from "./useModerationActions";
import ModerationToolbar from "./ModerationToolbar";
import ModerationActionsList from "./ModerationActionsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import PageHeader from "../../shared/PageHeader";

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
      <PageHeader title="MODERATION" />

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
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
