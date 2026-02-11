import { useState } from "react";
import { useTimeline } from "./useTimeline";
import { useReplay } from "./useReplay";
import TimelineToolbar from "./TimelineToolbar";
import TimelineList from "./TimelineList";
import TimelineDetailModal from "./TimelineDetailModal";
import ReplayPanel from "./ReplayPanel";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";

export default function TimelinePage() {
  const {
    entityType, setEntityType,
    entityId, setEntityId,
    includeCorrelated, setIncludeCorrelated,
    items, nextCursor, fetchState, loadMoreState, error,
    correlation,
    loadMore, refetch,
  } = useTimeline();

  const { replay, replayState, replayError, loadReplay, clearReplay } = useReplay();

  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  const handleReplayToPoint = (entry: any) => {
    const auditId = entry?.audit_id;
    const replayEntityType = entry?.entity?.type || entityType;
    const replayEntityId = entry?.entity?.id || entityId;

    if (replayEntityType && replayEntityId && auditId) {
      loadReplay(replayEntityType, replayEntityId, auditId);
      setSelectedEntry(null);
    }
  };

  return (
    <div data-testid="timeline-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>TIMELINE
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <TimelineToolbar
          entityType={entityType}
          onEntityTypeChange={setEntityType}
          entityId={entityId}
          onEntityIdChange={setEntityId}
          includeCorrelated={includeCorrelated}
          onIncludeCorrelatedChange={setIncludeCorrelated}
        />

        {fetchState === "done" && correlation && (
          <div className="flex flex-wrap gap-4 text-[10px] font-mono text-subtle uppercase border border-border rounded p-2 bg-surface/50">
            <span>Request IDs: <strong className="text-text">{correlation.request_ids?.length ?? 0}</strong></span>
            <span>Idempotency Keys: <strong className="text-text">{correlation.idempotency_keys?.length ?? 0}</strong></span>
            <span>Correlated Entities: <strong className="text-text">{correlation.correlated_entity_count ?? 0}</strong></span>
          </div>
        )}

        {fetchState === "loading" && <SkeletonTable columns={5} rows={8} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load timeline"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No timeline entries found" subtitle="Select an entity type and enter an ID" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <TimelineList items={items} onSelect={setSelectedEntry} />
            <Pagination
              nextCursor={nextCursor}
              loading={loadMoreState === "loading"}
              onLoadMore={loadMore}
            />
          </>
        )}

        {fetchState === "idle" && !entityType && (
          <EmptyState title="Select an entity" subtitle="Choose an entity type and enter its ID to view the timeline" />
        )}

        <ReplayPanel
          replay={replay}
          replayState={replayState}
          replayError={replayError}
          onClear={clearReplay}
        />
      </main>

      <TimelineDetailModal
        open={selectedEntry !== null}
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onReplayToPoint={handleReplayToPoint}
      />
    </div>
  );
}
