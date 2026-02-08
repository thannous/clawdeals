interface Props {
  actionType: string | null;
  payload: any;
}

export default function ApprovalContextPreview({ actionType, payload }: Props) {
  if (!payload || typeof payload !== "object") {
    return (
      <div className="text-xs font-mono text-muted">
        No context available
      </div>
    );
  }

  const entries = Object.entries(payload);

  if (actionType?.startsWith("listing.")) {
    return (
      <div className="space-y-2">
        {payload.title && (
          <div>
            <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">Title: </span>
            <span className="text-xs font-mono text-text">{payload.title}</span>
          </div>
        )}
        {payload.price != null && (
          <div>
            <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">Price: </span>
            <span className="text-xs font-mono text-primary">{payload.price} {payload.currency || "USD"}</span>
          </div>
        )}
        {payload.category && (
          <div>
            <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">Category: </span>
            <span className="text-xs font-mono text-text">{payload.category}</span>
          </div>
        )}
        {payload.condition && (
          <div>
            <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">Condition: </span>
            <span className="text-xs font-mono text-text">{payload.condition}</span>
          </div>
        )}
      </div>
    );
  }

  if (actionType?.startsWith("thread.")) {
    return (
      <div className="space-y-2">
        {payload.message_type && (
          <div>
            <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">Type: </span>
            <span className="text-xs font-mono text-text">{payload.message_type}</span>
          </div>
        )}
        {payload.body && (
          <div>
            <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">Body: </span>
            <span className="text-xs font-mono text-text whitespace-pre-wrap break-words">
              {String(payload.body).slice(0, 500)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="space-y-1">
      {entries.slice(0, 10).map(([key, val]) => (
        <div key={key}>
          <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">{key}: </span>
          <span className="text-xs font-mono text-text">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
        </div>
      ))}
    </div>
  );
}
