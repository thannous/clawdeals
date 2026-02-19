import { useState, useCallback } from "react";

interface Props {
  id?: string | null;
  chars?: number;
  stopPropagation?: boolean;
}

export default function TruncatedId({ id, chars = 8, stopPropagation = true }: Props) {
  const [copied, setCopied] = useState(false);
  const canCopy = typeof id === "string" && id.length > 0;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canCopy || !id) return;
      if (stopPropagation) e.stopPropagation();
      const promise = navigator.clipboard?.writeText(id);
      if (!promise) return;
      promise.then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {
        // Best-effort: clipboard may be unavailable in some contexts.
      });
    },
    [canCopy, id, stopPropagation]
  );

  const truncated = canCopy && id.length > chars ? id.slice(0, chars) : canCopy ? id : "\u2014";

  if (!canCopy) {
    return <span className="text-subtle">{truncated}</span>;
  }

  return (
    <button
      type="button"
      title={id}
      onClick={handleClick}
      className="cursor-copy text-muted hover:text-text transition-colors bg-transparent border-0 p-0 font-inherit text-left"
    >
      {copied ? "Copied!" : truncated}
    </button>
  );
}
