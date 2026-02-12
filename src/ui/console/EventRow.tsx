import { memo, useCallback } from "react";

function formatTimestamp(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return ts || "--:--:--.---";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function truncateId(id) {
  if (!id || typeof id !== "string") return "\u2014";
  return id.length > 8 ? id.slice(0, 8) : id;
}

function getTypeBadgeClasses(type) {
  if (!type) return "border-border text-subtle bg-surface";
  if (type.startsWith("deal.")) return "border-primary/40 text-primary bg-primary/10";
  if (type.startsWith("watchlist.")) return "border-secondary/40 text-secondary bg-secondary/10";
  return "border-border text-muted bg-surface-alt";
}

function summarizePayload(payload, truncated) {
  if (truncated) return "(truncated)";
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) return "{}";
  const json = JSON.stringify(payload);
  if (json.length > 100) return json.slice(0, 100) + "\u2026";
  return json;
}

function EventRow({ event, onClick }) {
  const handleClick = useCallback(() => {
    if (onClick) onClick(event);
  }, [event, onClick]);

  const typeBadgeClasses = getTypeBadgeClasses(event.type);

  return (
    <button
      data-testid="event-row"
      type="button"
      onClick={handleClick}
      className="w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-surface-alt/50 border-b border-border/50 transition-colors cursor-pointer font-mono text-xs"
    >
      {/* Timestamp */}
      <span data-testid="event-ts" className="text-subtle shrink-0 tabular-nums">
        {formatTimestamp(event.ts)}
      </span>

      {/* Type badge */}
      <span
        data-testid="event-type"
        className={`shrink-0 px-1.5 py-0.5 rounded border text-xs font-bold uppercase ${typeBadgeClasses}`}
      >
        {event.type || "unknown"}
      </span>

      {/* Entity */}
      {event.entity && (
        <span data-testid="event-entity" className="shrink-0 text-muted">
          <span className="text-subtle">{event.entity.type || "?"}</span>
          {" "}
          <span className="text-text">{truncateId(event.entity.id)}</span>
        </span>
      )}

      {/* Actor */}
      {event.actor && (
        <span data-testid="event-actor" className="shrink-0 text-subtle">
          {event.actor.type || "?"}:{truncateId(event.actor.id)}
        </span>
      )}

      {/* Payload summary */}
      <span data-testid="event-payload" className="text-subtle truncate min-w-0">
        {summarizePayload(event.payload, event.payload_truncated)}
      </span>
    </button>
  );
}

export default memo(EventRow);
