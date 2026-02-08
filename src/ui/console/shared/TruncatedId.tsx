import { useState, useCallback } from "react";

interface Props {
  id: string;
  chars?: number;
}

export default function TruncatedId({ id, chars = 8 }: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(id).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [id]
  );

  const truncated = id && id.length > chars ? id.slice(0, chars) : id || "\u2014";

  return (
    <span
      title={id}
      onClick={handleClick}
      className="cursor-copy text-muted hover:text-text transition-colors"
    >
      {copied ? "Copied!" : truncated}
    </span>
  );
}
