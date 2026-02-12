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
        <span className="text-xs font-mono text-subtle uppercase mr-1">Action:</span>
        <button
          onClick={() => onActionTypeChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
        <span className="text-xs font-mono text-subtle uppercase mr-1">Entity:</span>
        <button
          onClick={() => onEntityTypeChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            placeholder="Entity ID…"
            aria-label="Entity ID"
            name="entity_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>
      </div>
    </div>
  );
}
