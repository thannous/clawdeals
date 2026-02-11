import { useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";

interface Props {
  open: boolean;
  entry: any | null;
  onClose: () => void;
}

export default function AuditDetailModal({ open, entry, onClose }: Props) {
  const router = useRouter();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open || !entry) return null;

  const rows: [string, string][] = [
    ["Audit ID", entry.audit_id || "\u2014"],
    ["Timestamp", entry.ts ? new Date(entry.ts).toISOString() : "\u2014"],
    ["Actor Type", entry.actor?.type || "\u2014"],
    ["Actor ID", entry.actor?.id || "\u2014"],
    ["Action", entry.action || "\u2014"],
    ["Entity Type", entry.entity?.type || "\u2014"],
    ["Entity ID", entry.entity?.id || "\u2014"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
      {/* Overlay */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0 modal-overlay"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-surface border border-border rounded clip-corner p-6 max-w-lg w-full mx-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <h2 id="audit-detail-title" className="text-sm font-bold font-mono uppercase tracking-wider text-text">Audit Entry</h2>

        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">{label}</dt>
              <dd className="text-xs font-mono text-text break-all">{value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">Outcome</dt>
            <dd className="text-xs"><ConsoleStatusBadge value={entry.outcome || "UNKNOWN"} variant="audit" /></dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">Metadata Hash</dt>
            <dd className="text-xs font-mono text-text break-all">{entry.metadata?.hash || "\u2014"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">Request ID</dt>
            <dd className="text-xs font-mono text-text break-all">{entry.request_id || "\u2014"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">Redacted</dt>
            <dd className="text-xs font-mono text-text">{entry.metadata?.redacted ? "Yes" : "No"}</dd>
          </div>
        </dl>

        <div className="flex justify-between items-center pt-2">
          {entry.entity?.type && entry.entity?.id ? (
            <button
              onClick={() => {
                onClose();
                router.push(`/console/timeline?entity_type=${encodeURIComponent(entry.entity.type)}&entity_id=${encodeURIComponent(entry.entity.id)}`);
              }}
              className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
            >
              View Timeline
            </button>
          ) : <span />}
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
