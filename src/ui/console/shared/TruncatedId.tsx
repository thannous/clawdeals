import { useState, useCallback } from "react";

interface Props {
  id?: string | null;
  chars?: number;
}

export default function TruncatedId({ id, chars = 8 }: Props) {
  const [copied, setCopied] = useState(false);
  const canCopy = typeof id === "string" && id.length > 0;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canCopy || !id) return;
      e.stopPropagation();
      const promise = navigator.clipboard?.writeText(id);
      if (!promise) return;
      promise.then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {
        // Best-effort: clipboard may be unavailable in some contexts.
      });
    },
    [canCopy, id]
  );

  const truncated = canCopy && id.length > chars ? id.slice(0, chars) : canCopy ? id : "\u2014";

  return (
    <span
      title={canCopy ? id : undefined}
      onClick={handleClick}
      className={
        canCopy
          ? "cursor-copy text-muted hover:text-text transition-colors"
          : "text-subtle"
      }
    >
      {canCopy && copied ? "Copied!" : truncated}
    </span>
  );
}
