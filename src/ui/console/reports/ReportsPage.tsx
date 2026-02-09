import { useState } from "react";
import { useReports } from "./useReports";
import { useBulkReportAction } from "./useBulkReportAction";
import ReportsToolbar from "./ReportsToolbar";
import ReportsList from "./ReportsList";
import ReportActionModal from "./ReportActionModal";
import Pagination from "../shared/Pagination";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import ToastContainer from "../shared/Toast";
import { useToast } from "../shared/useToast";
import { useRouter } from "next/router";

export default function ReportsPage() {
  const router = useRouter();
  const toast = useToast();

  const {
    items,
    status, setStatus,
    entityType, setEntityType,
    reasonCode, setReasonCode,
    reporterOwnerId, setReporterOwnerId,
    selectedIds, toggleSelection, toggleSelectAll, clearSelection,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  } = useReports();

  const bulkAction = useBulkReportAction({
    onSuccess: () => {
      toast.show("Bulk action completed successfully", "success");
      clearSelection();
      refetch();
    },
  });

  const [bulkModalAction, setBulkModalAction] = useState<"confirm" | "reject" | null>(null);

  const handleBulkSubmit = (reason: string) => {
    if (bulkModalAction) {
      bulkAction.execute(Array.from(selectedIds), bulkModalAction, reason);
      setBulkModalAction(null);
    }
  };

  const handleRowClick = (report: any) => {
    router.push(`/console/reports/${report.report_id}`);
  };

  const currentPageIds = items.map((r: any) => r.report_id);

  return (
    <div data-testid="reports-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>REPORTS
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ReportsToolbar
          status={status}
          onStatusChange={setStatus}
          entityType={entityType}
          onEntityTypeChange={setEntityType}
          reasonCode={reasonCode}
          onReasonCodeChange={setReasonCode}
          reporterOwnerId={reporterOwnerId}
          onReporterOwnerIdChange={setReporterOwnerId}
        />

        {fetchState === "loading" && <SkeletonTable columns={11} rows={10} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load reports"} onRetry={refetch} />}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No reports found" subtitle="Try adjusting your filters" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <>
            <ReportsList
              items={items}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              onToggleSelectAll={() => toggleSelectAll(currentPageIds)}
              onRowClick={handleRowClick}
            />
            <Pagination
              nextCursor={nextCursor}
              loading={loadMoreState === "loading"}
              onLoadMore={loadMore}
            />
          </>
        )}
      </main>

      {/* Bulk action error */}
      {bulkAction.error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 border border-red-500/40 bg-red-500/5 rounded clip-corner p-4">
          <p className="text-xs text-red-300 font-mono">{bulkAction.error}</p>
        </div>
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-mono text-muted">
              {selectedIds.size} report{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => clearSelection()}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setBulkModalAction("confirm")}
                disabled={bulkAction.submitState === "loading"}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50 transition-colors"
              >
                Confirm All
              </button>
              <button
                onClick={() => setBulkModalAction("reject")}
                disabled={bulkAction.submitState === "loading"}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-red-400 text-red-400 rounded hover:bg-red-400/10 disabled:opacity-50 transition-colors"
              >
                Reject All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action modal */}
      <ReportActionModal
        open={bulkModalAction !== null}
        title={bulkModalAction === "confirm" ? `Confirm ${selectedIds.size} reports?` : `Reject ${selectedIds.size} reports?`}
        message={
          bulkModalAction === "confirm"
            ? "This will confirm all selected reports and may trigger trust penalties on reported entities."
            : "This will reject all selected reports as invalid."
        }
        action={bulkModalAction || "confirm"}
        loading={bulkAction.submitState === "loading"}
        onSubmit={handleBulkSubmit}
        onCancel={() => setBulkModalAction(null)}
      />

      {/* Toast */}
      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
