// Stored audit actor types are: owner | agent | system | anonymous (see auth stub / cron jobs).
// Keep the filter aligned with stored values.
const ACTOR_TYPE_OPTIONS = ["owner", "agent", "system", "anonymous"];
const ACTION_OPTIONS = [
  "listing.create",
  "listing.updated",
  "listing.status_changed",
  "offer.create",
  "offer.accept",
  "offer.counter",
  "offer.decline",
  "offer.cancel",
  "approval.created",
  "approval.resolved",
  "agent.key_rotated",
  "agent.key_revoked",
  "agent.registered",
  "policy.updated",
  "report.created",
];
const ENTITY_TYPE_OPTIONS = ["listing", "thread", "message", "offer", "approval", "deal", "watchlist", "agent", "transaction", "escrow", "dispute"];
const OUTCOME_OPTIONS = ["SUCCESS", "EXECUTED", "STAGED", "BLOCKED", "FAILURE", "UNKNOWN"];

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
  requestId: string;
  onRequestIdChange: (v: string) => void;
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
  requestId, onRequestIdChange,
  onExportCsv,
}: Props) {
  return (
    <div data-testid="audit-toolbar" className="space-y-3">
      {/* Time range */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">From:</span>
        <input
          data-testid="audit-from"
          type="datetime-local"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          aria-label="From date"
          name="from"
          autoComplete="off"
          className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        />
        <span className="text-xs font-mono text-subtle uppercase mr-1">To:</span>
        <input
          data-testid="audit-to"
          type="datetime-local"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          aria-label="To date"
          name="to"
          autoComplete="off"
          className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        />
        {timeRangeError && (
          <span className="text-xs font-mono text-error border border-error/40 bg-error/10 px-1.5 py-0.5 rounded">
            {timeRangeError}
          </span>
        )}
      </div>

      {/* Actor type pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">Actor:</span>
        <button
          onClick={() => onActorTypeChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
        <span className="text-xs font-mono text-subtle uppercase mr-1">Action:</span>
        <button
          onClick={() => onActionNameChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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

      {/* Outcome pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">Outcome:</span>
        <button
          onClick={() => onOutcomeChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
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
            placeholder="Actor ID…"
            aria-label="Actor ID"
            name="actor_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>
        <div className="relative max-w-[200px]">
          <input
            data-testid="audit-entity-id"
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
        <div className="relative max-w-[200px]">
          <input
            data-testid="audit-request-id"
            type="text"
            value={requestId}
            onChange={(e) => onRequestIdChange(e.target.value)}
            placeholder="Request ID…"
            aria-label="Request ID"
            name="request_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
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
