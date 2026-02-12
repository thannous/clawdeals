const STATE_OPTIONS = ["PENDING", "APPROVED", "DENIED"];
const ACTION_TYPE_OPTIONS = ["listing_publish", "thread.create", "message.send", "offer_over_budget"];

interface Props {
  state: string;
  onStateChange: (s: string) => void;
  actionType: string | null;
  onActionTypeChange: (a: string | null) => void;
  agentId: string;
  onAgentIdChange: (v: string) => void;
}

export default function ApprovalsToolbar({
  state, onStateChange,
  actionType, onActionTypeChange,
  agentId, onAgentIdChange,
}: Props) {
  return (
    <div data-testid="approvals-toolbar" className="space-y-3">
      {/* State pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">State:</span>
        {STATE_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStateChange(s)}
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
              state === s
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Action type pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">Action:</span>
        <button
          onClick={() => onActionTypeChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
            actionType === null
              ? "border-secondary/40 text-secondary bg-secondary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {ACTION_TYPE_OPTIONS.map((a) => (
          <button
            key={a}
            onClick={() => onActionTypeChange(actionType === a ? null : a)}
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
              actionType === a
                ? "border-secondary/40 text-secondary bg-secondary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Agent ID input */}
      <div className="max-w-sm">
        <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="approvals-agent-id">
          Agent ID
        </label>
        <input
          id="approvals-agent-id"
          data-testid="approvals-agent-id"
          type="text"
          value={agentId}
          onChange={(e) => onAgentIdChange(e.target.value)}
          placeholder="Filter by agent UUID…"
          name="agent_id"
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        />
      </div>
    </div>
  );
}
