import { useState } from "react";
import { useAuditLogs } from "./useAuditLogs";
import AuditToolbar from "./AuditToolbar";
import AuditList from "./AuditList";
import AuditDetailModal from "./AuditDetailModal";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";

export default function AuditPage() {
  const {
    items, from, setFrom, to, setTo,
    actorType, setActorType, actorId, setActorId,
    actionName, setActionName, entityType, setEntityType,
    entityId, setEntityId, outcome, setOutcome,
    requestId, setRequestId,
    timeRangeError, nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch, exportCsv,
  } = useAuditLogs();

  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  return (
    <div data-testid="audit-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>AUDIT
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <AuditToolbar
          from={from}
          onFromChange={setFrom}
          to={to}
          onToChange={setTo}
          timeRangeError={timeRangeError}
          actorType={actorType}
          onActorTypeChange={setActorType}
          actorId={actorId}
          onActorIdChange={setActorId}
          actionName={actionName}
          onActionNameChange={setActionName}
          entityType={entityType}
          onEntityTypeChange={setEntityType}
          entityId={entityId}
          onEntityIdChange={setEntityId}
          outcome={outcome}
          onOutcomeChange={setOutcome}
          requestId={requestId}
          onRequestIdChange={setRequestId}
          onExportCsv={exportCsv}
        />

        {fetchState === "loading" && <SkeletonTable columns={7} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load audit logs"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No audit entries found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <AuditList items={items} onSelect={setSelectedEntry} />
            <Pagination
              nextCursor={nextCursor}
              loading={loadMoreState === "loading"}
              onLoadMore={loadMore}
            />
          </>
        )}
      </main>

      <AuditDetailModal
        open={selectedEntry !== null}
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
