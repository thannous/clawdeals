import { useState, useEffect, useCallback } from "react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  action: "confirm" | "reject";
  loading?: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}

function ReportActionModalInner({
  title,
  message,
  action,
  loading = false,
  onSubmit,
  onCancel,
}: Omit<Props, "open">) {
  const [reason, setReason] = useState("");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    },
    [onCancel, loading]
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const confirmColors =
    action === "confirm"
      ? "border-secondary text-secondary hover:bg-secondary/10"
      : "border-red-400 text-red-400 hover:bg-red-400/10";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="report-action-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-action-modal-title"
    >
      {/* Overlay */}
      <div className="absolute inset-0 modal-overlay" onClick={loading ? undefined : onCancel} />

      {/* Dialog */}
      <div className="relative bg-surface border border-border rounded clip-corner p-6 max-w-md w-full mx-4 space-y-4">
        <h2 id="report-action-modal-title" className="text-sm font-bold font-mono uppercase tracking-wider text-text">
          {title}
        </h2>
        <p className="text-xs font-mono text-muted leading-relaxed">{message}</p>

        <div>
          <label className="block text-[10px] font-mono text-subtle uppercase mb-1">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={3}
            placeholder="Optional reason for this action..."
            className="w-full px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors resize-none"
          />
          <span className="text-[10px] font-mono text-subtle">{reason.length}/1000</span>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 border-border text-muted hover:border-border-strong hover:text-text"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={() => onSubmit(reason)}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${confirmColors}`}
          >
            {loading ? "Processing..." : action === "confirm" ? "Confirm" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportActionModal({ open, ...rest }: Props) {
  if (!open) return null;
  return <ReportActionModalInner key={rest.action} {...rest} />;
}
