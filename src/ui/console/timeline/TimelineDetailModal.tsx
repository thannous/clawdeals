import { useEffect, useCallback, useRef } from "react";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";

interface Props {
  open: boolean;
  entry: any | null;
  onClose: () => void;
  onReplayToPoint: (entry: any) => void;
}

export default function TimelineDetailModal({ open, entry, onClose, onReplayToPoint }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    // Focus the close button so keyboard users land inside the dialog
    requestAnimationFrame(() => closeRef.current?.focus());
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
    ["Metadata Hash", entry.metadata?.hash || "\u2014"],
    ["Request ID", entry.request_id || "\u2014"],
    ["Idempotency Key", entry.idempotency_key || "\u2014"],
    ["Correlation Source", entry.correlation_source || "\u2014"],
    ["Redacted", entry.metadata?.redacted ? "Yes" : "No"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="timeline-detail-title">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0 modal-overlay"
        onClick={onClose}
      />

      <div className="relative bg-surface border border-border rounded clip-corner p-6 max-w-lg w-full mx-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <h2 id="timeline-detail-title" className="text-sm font-bold font-mono uppercase tracking-wider text-text">Timeline Entry</h2>

        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">{label}</dt>
              <dd className="text-xs font-mono text-text break-all">{value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">Outcome</dt>
            <dd className="text-xs"><ConsoleStatusBadge value={entry.outcome || "UNKNOWN"} variant="audit" /></dd>
          </div>
        </dl>

        <div className="flex justify-between items-center pt-2">
          <button
            onClick={() => {
              if (entry.audit_id) onReplayToPoint(entry);
            }}
            disabled={!entry.audit_id}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 disabled:opacity-50 transition-colors"
          >
            Replay to this point
          </button>
          <button
            ref={closeRef}
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
