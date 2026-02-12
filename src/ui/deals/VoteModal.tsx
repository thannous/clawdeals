import { useEffect, useRef, useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown, X, Loader2 } from "lucide-react";

const MAX_REASON = 240;
const WARN_THRESHOLD = 200;

export default function VoteModal({ isOpen, targetDeal, direction, submitState, error, retryIn, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState(null);
  const overlayRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Focus textarea after render
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  // Escape to close
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Click outside to close
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setLocalError("Reason is required");
      return;
    }
    if (trimmed.length > MAX_REASON) {
      setLocalError(`Reason must be ${MAX_REASON} characters or fewer`);
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  };

  if (!isOpen) return null;

  const isUp = direction === "up";
  const DirectionIcon = isUp ? ThumbsUp : ThumbsDown;
  const dirColor = isUp ? "text-secondary" : "text-red-400";
  const charCount = reason.length;
  const isOverWarn = charCount >= WARN_THRESHOLD;
  const isSubmitting = submitState === "submitting";
  const displayError = localError || error;

  return (
    <div
      ref={overlayRef}
      data-testid="vote-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Vote ${direction} on deal`}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
    >
      <div
        data-testid="vote-modal"
        className="w-full max-w-md bg-surface border border-border clip-corner"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <DirectionIcon size={18} className={dirColor} />
          <h2 className="flex-1 text-sm font-semibold text-text truncate">
            {targetDeal?.title || "Deal"}
          </h2>
          <button
            data-testid="vote-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-subtle hover:text-text transition-colors"
          >
            <X size={16} aria-hidden="true" focusable="false" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {displayError && (
            <div data-testid="vote-error" className="px-3 py-2 text-xs font-mono border border-red-500/40 bg-red-500/10 text-red-300 rounded">
              {displayError}
              {retryIn > 0 && <span className="ml-1 font-bold">({retryIn}s)</span>}
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="vote-reason">
              Reason
            </label>
            <textarea
              id="vote-reason"
              ref={textareaRef}
              data-testid="vote-reason"
              name="reason"
              autoComplete="off"
              spellCheck={false}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
              placeholder="e.g. Too expensive for the specs…"
              rows={4}
              maxLength={MAX_REASON}
              className="w-full px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg resize-none transition-colors"
            />
            <div className={`text-right text-xs font-mono mt-1 ${isOverWarn ? "text-primary" : "text-subtle"}`}>
              {charCount}/{MAX_REASON}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            data-testid="vote-cancel"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-xs font-mono text-muted hover:text-text border border-transparent hover:border-border rounded transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="vote-submit"
            onClick={handleSubmit}
            disabled={isSubmitting || retryIn > 0}
            className="px-4 py-1.5 text-xs font-mono font-bold uppercase bg-primary text-bg rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={12} className="animate-spin" />}
            {isSubmitting ? "Submitting…" : retryIn > 0 ? `Wait ${retryIn}s` : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
