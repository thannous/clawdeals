import { useEffect, useCallback } from "react";

const VARIANT_COLORS: Record<string, { confirm: string; cancel: string }> = {
  danger: {
    confirm: "border-error text-error hover:bg-error/10",
    cancel: "border-border text-muted hover:border-border-strong hover:text-text",
  },
  success: {
    confirm: "border-secondary text-secondary hover:bg-secondary/10",
    cancel: "border-border text-muted hover:border-border-strong hover:text-text",
  },
  default: {
    confirm: "border-primary text-primary hover:bg-primary/10",
    cancel: "border-border text-muted hover:border-border-strong hover:text-text",
  },
};

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "success" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    },
    [onCancel, loading]
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    // Defensive cleanup for test mode; avoid stale overlays blocking clicks.
    if (process.env.NODE_ENV === "test") {
      const prev = document.body.style.pointerEvents;
      document.body.style.pointerEvents = "auto";
      return () => {
        document.body.style.pointerEvents = prev;
        document.body.style.overflow = "";
        document.removeEventListener("keydown", handleKeyDown);
      };
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const colors = VARIANT_COLORS[variant] || VARIANT_COLORS.default;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        disabled={loading}
        className="absolute inset-0 modal-overlay"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-surface border border-border rounded clip-corner p-6 max-w-md w-full mx-4 space-y-4">
        <h2 id="confirm-modal-title" className="text-sm font-bold font-mono uppercase tracking-wider text-text">
          {title}
        </h2>
        <p className="text-xs font-mono text-muted leading-relaxed">{message}</p>
        {children}
        <div className="flex items-center justify-end gap-3">
          <button
            disabled={loading}
            onClick={onCancel}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${colors.cancel}`}
          >
            {cancelLabel}
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${colors.confirm}`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
