const ENTITY_TYPE_OPTIONS = [
  "listing", "thread", "message", "offer", "approval",
  "deal", "watchlist", "agent", "transaction", "escrow", "dispute",
];

interface Props {
  entityType: string | null;
  onEntityTypeChange: (v: string | null) => void;
  entityId: string;
  onEntityIdChange: (v: string) => void;
  includeCorrelated: boolean;
  onIncludeCorrelatedChange: (v: boolean) => void;
}

export default function TimelineToolbar({
  entityType, onEntityTypeChange,
  entityId, onEntityIdChange,
  includeCorrelated, onIncludeCorrelatedChange,
}: Props) {
  return (
    <div data-testid="timeline-toolbar" className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Entity Type:</span>
        <select
          data-testid="timeline-entity-type"
          value={entityType || ""}
          onChange={(e) => onEntityTypeChange(e.target.value || null)}
          aria-label="Entity type"
          className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        >
          <option value="">Select...</option>
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Entity ID:</span>
        <div className="relative max-w-[280px]">
          <input
            data-testid="timeline-entity-id"
            type="text"
            value={entityId}
            onChange={(e) => onEntityIdChange(e.target.value)}
            placeholder="Entity ID..."
            aria-label="Entity ID"
            name="entity_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            data-testid="timeline-include-correlated"
            type="checkbox"
            checked={includeCorrelated}
            onChange={(e) => onIncludeCorrelatedChange(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-[10px] font-mono text-subtle uppercase">Include correlated</span>
        </label>
      </div>
    </div>
  );
}
