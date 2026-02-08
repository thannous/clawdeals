const ACTOR_TYPE_OPTIONS = ["agent", "human", "system"];
const ACTION_OPTIONS = [
  "listing.create",
  "listing.update",
  "offer.create",
  "offer.accept",
  "offer.reject",
  "approval.approved",
  "approval.denied",
  "agent.key_rotated",
  "agent.key_revoked",
];
const ENTITY_TYPE_OPTIONS = ["listing", "thread", "message", "offer", "approval", "agent", "owner"];
const OUTCOME_OPTIONS = ["SUCCESS", "FAILURE"];

interface Props {
  from: string;
  onFromChange: (v: string) => void;
  to: string;
  onToChange: (v: string) => void;
  timeRangeError: string | null;
  actorType: string | null;
  onActorTypeChange: (v: string | null) => void;
  actorId: string;
  onActorIdChange: (v: string) => void;
  actionName: string | null;
  onActionNameChange: (v: string | null) => void;
  entityType: string | null;
  onEntityTypeChange: (v: string | null) => void;
  entityId: string;
  onEntityIdChange: (v: string) => void;
  outcome: string | null;
  onOutcomeChange: (v: string | null) => void;
  onExportCsv: () => void;
}

export default function AuditToolbar({
  from, onFromChange,
  to, onToChange,
  timeRangeError,
  actorType, onActorTypeChange,
  actorId, onActorIdChange,
  actionName, onActionNameChange,
  entityType, onEntityTypeChange,
  entityId, onEntityIdChange,
  outcome, onOutcomeChange,
  onExportCsv,
}: Props) {
  return (
    <div data-testid="audit-toolbar" className="space-y-3">
      {/* Time range */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">From:</span>
        <input
          data-testid="audit-from"
          type="datetime-local"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          aria-label="From date"
          className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text focus:outline-none focus:border-primary transition-colors"
        />
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">To:</span>
        <input
          data-testid="audit-to"
          type="datetime-local"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          aria-label="To date"
          className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text focus:outline-none focus:border-primary transition-colors"
        />
        {timeRangeError && (
          <span className="text-[10px] font-mono text-red-400 border border-red-400/40 bg-red-400/10 px-1.5 py-0.5 rounded">
            {timeRangeError}
          </span>
        )}
      </div>

      {/* Actor type pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Actor:</span>
        <button
          onClick={() => onActorTypeChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            actorType === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {ACTOR_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => onActorTypeChange(actorType === opt ? null : opt)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              actorType === opt
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Action pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Action:</span>
        <button
          onClick={() => onActionNameChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            actionName === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {ACTION_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => onActionNameChange(actionName === opt ? null : opt)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              actionName === opt
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

      {/* Outcome pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Outcome:</span>
        <button
          onClick={() => onOutcomeChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            outcome === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {OUTCOME_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => onOutcomeChange(outcome === opt ? null : opt)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              outcome === opt
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Actor ID + Entity ID + Export */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-[200px]">
          <input
            data-testid="audit-actor-id"
            type="text"
            value={actorId}
            onChange={(e) => onActorIdChange(e.target.value)}
            placeholder="Actor ID..."
            aria-label="Actor ID"
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="relative max-w-[200px]">
          <input
            data-testid="audit-entity-id"
            type="text"
            value={entityId}
            onChange={(e) => onEntityIdChange(e.target.value)}
            placeholder="Entity ID..."
            aria-label="Entity ID"
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="ml-auto">
          <button
            data-testid="audit-export-csv"
            onClick={onExportCsv}
            className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
