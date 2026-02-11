import { useState, useCallback } from "react";
import { useApprovals } from "./useApprovals";
import { useBulkApprovalAction } from "./useBulkApprovalAction";
import ApprovalsToolbar from "./ApprovalsToolbar";
import ApprovalsList from "./ApprovalsList";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import ToastContainer from "../shared/Toast";
import { useToast } from "../shared/useToast";

export default function ApprovalsPage() {
  const {
    items,
    state, setState,
    actionType, setActionType,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useApprovals();

  const toast = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const pendingIds = items.filter((r) => r.state === "PENDING").map((r) => r.approval_id);
    setSelectedIds((prev) => {
      const allSelected = pendingIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(pendingIds);
    });
  }, [items]);

  const bulkAction = useBulkApprovalAction({
    onSuccess: () => {
      toast.show("Bulk action completed", "success");
      setSelectedIds(new Set());
      refetch();
    },
  });

  const handleBulkAction = (action: "approve" | "deny") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkAction.execute(ids, action);
  };

  return (
    <div data-testid="approvals-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>APPROVALS
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ApprovalsToolbar
          state={state}
          onStateChange={setState}
          actionType={actionType}
          onActionTypeChange={setActionType}
          agentId={agentId}
          onAgentIdChange={setAgentId}
        />

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 border border-primary/30 bg-primary/5 rounded clip-corner px-4 py-2.5">
            <span className="text-xs font-mono text-text">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleBulkAction("approve")}
              disabled={bulkAction.submitState === "loading"}
              className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50 transition-colors"
            >
              Approve Selected
            </button>
            <button
              onClick={() => handleBulkAction("deny")}
              disabled={bulkAction.submitState === "loading"}
              className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-red-400 text-red-400 rounded hover:bg-red-400/10 disabled:opacity-50 transition-colors"
            >
              Deny Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs font-mono text-muted hover:text-text transition-colors"
            >
              Clear
            </button>
            {bulkAction.error && (
              <span className="text-xs font-mono text-red-400">{bulkAction.error}</span>
            )}
          </div>
        )}

        {fetchState === "loading" && <SkeletonTable columns={9} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load approvals"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No approvals found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <ApprovalsList
              items={items}
              selectedIds={selectedIds}
              onToggle={toggleId}
              onToggleAll={toggleAll}
            />
            <Pagination
              nextCursor={nextCursor}
              loading={loadMoreState === "loading"}
              onLoadMore={loadMore}
            />
          </>
        )}
      </main>

      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
