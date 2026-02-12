import { useState } from "react";
import { Pause, Play, Filter } from "lucide-react";

const EVENT_TYPES = [
  "deal.created",
  "deal.temperature_changed",
  "deal.state_changed",
  "watchlist.match",
  "agent.registered"
];

export default function LiveFeedToolbar({
  types,
  onTypesChange,
  entityId,
  onEntityIdChange,
  paused,
  onPauseToggle,
  connectionState,
  missedCount
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleType = (type) => {
    const current = new Set(types);
    if (current.has(type)) {
      current.delete(type);
    } else {
      current.add(type);
    }
    onTypesChange(Array.from(current));
  };

  const connectionBadge = () => {
    switch (connectionState) {
      case "connected":
        return (
          <span data-testid="connection-badge" className="flex items-center gap-1 text-xs font-mono text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            CONNECTED
          </span>
        );
      case "connecting":
        return (
          <span data-testid="connection-badge" className="flex items-center gap-1 text-xs font-mono text-yellow-400">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            CONNECTING
          </span>
        );
      case "reconnecting":
        return (
          <span data-testid="connection-badge" className="flex items-center gap-1 text-xs font-mono text-orange-400">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            RECONNECTING
          </span>
        );
      default:
        return (
          <span data-testid="connection-badge" className="flex items-center gap-1 text-xs font-mono text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            DISCONNECTED
          </span>
        );
    }
  };

  return (
    <div data-testid="live-feed-toolbar" className="space-y-3">
      {/* Top row: controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        {/* Connection badge */}
        {connectionBadge()}

        {/* Entity ID filter */}
        <div className="relative flex-1 max-w-xs">
          <input
            data-testid="entity-id-input"
            type="text"
            value={entityId}
            onChange={(e) => onEntityIdChange(e.target.value)}
            placeholder="Filter by entity ID…"
            aria-label="Filter by entity ID"
            name="entity_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>

        {/* Pause/Resume */}
        <button
          data-testid="pause-toggle"
          onClick={onPauseToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase rounded border transition-colors ${
            paused
              ? "border-yellow-400/40 text-yellow-400 bg-yellow-400/10"
              : "border-border text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? "RESUME" : "PAUSE"}
          {paused && missedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-300 text-xs">
              +{missedCount}
            </span>
          )}
        </button>

        {/* Filter toggle for mobile */}
        <button
          data-testid="filters-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-label="Toggle filters"
          className="sm:hidden px-3 py-1.5 text-xs font-mono border border-border rounded text-muted hover:text-text"
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Event type filters */}
      <div className={`flex flex-wrap gap-2 items-center ${filtersOpen ? "" : "hidden sm:flex"}`}>
        <span className="text-xs font-mono text-subtle uppercase mr-1">Types:</span>
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            data-testid={`type-filter-${type}`}
            onClick={() => toggleType(type)}
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
              types.includes(type)
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
