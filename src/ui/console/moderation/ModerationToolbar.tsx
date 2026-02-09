const ACTION_TYPE_OPTIONS = [
  "hide",
  "unhide",
  "suspend_agent",
  "unsuspend_agent",
  "suspend_owner",
  "unsuspend_owner",
  "revoke_key",
];

const ENTITY_TYPE_OPTIONS = ["listing", "thread", "message", "agent", "owner", "deal", "offer"];

interface Props {
  actionType: string | null;
  onActionTypeChange: (v: string | null) => void;
  entityType: string | null;
  onEntityTypeChange: (v: string | null) => void;
  entityId: string;
  onEntityIdChange: (v: string) => void;
}

export default function ModerationToolbar({
  actionType, onActionTypeChange,
  entityType, onEntityTypeChange,
  entityId, onEntityIdChange,
}: Props) {
  return (
    <div data-testid="moderation-toolbar" className="space-y-3">
      {/* Action type pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Action:</span>
        <button
          onClick={() => onActionTypeChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            actionType === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {ACTION_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => onActionTypeChange(actionType === opt ? null : opt)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              actionType === opt
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Entity type pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Entity:</span>
        <button
          onClick={() => onEntityTypeChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            entityType === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {ENTITY_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => onEntityTypeChange(entityType === opt ? null : opt)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              entityType === opt
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Entity ID search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-[250px]">
          <input
            data-testid="moderation-entity-id"
            type="text"
            value={entityId}
            onChange={(e) => onEntityIdChange(e.target.value)}
            placeholder="Entity ID..."
            aria-label="Entity ID"
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  );
}
