import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

interface Props {
  message: any;
}

export default function MessageCard({ message }: Props) {
  const isWarning = message.flagged || message.moderation_action;

  return (
    <div
      className={`border rounded clip-corner p-4 space-y-2 ${
        isWarning
          ? "border-yellow-400/40 bg-yellow-400/5"
          : "border-border bg-surface"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Message type badge */}
        {message.message_type && (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-secondary/40 text-secondary bg-secondary/10">
            {message.message_type}
          </span>
        )}

        {/* Sender badge */}
        <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
          {message.sender_role || "agent"}
        </span>

        <TruncatedId id={message.sender_agent_id} chars={8} />

        {/* Redacted badge */}
        {message.redacted && (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-red-400/40 text-red-400 bg-red-400/10">
            REDACTED
          </span>
        )}

        {/* Warning highlight */}
        {isWarning && (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-yellow-400/40 text-yellow-400 bg-yellow-400/10">
            FLAGGED
          </span>
        )}

        <span className="ml-auto text-[10px] font-mono text-subtle tabular-nums">
          {formatDate(message.created_at)}
        </span>
      </div>

      {/* Body */}
      {message.body && (
        <p className="text-sm font-mono text-text whitespace-pre-wrap break-words leading-relaxed">
          {message.body}
        </p>
      )}

      {/* Offer display */}
      {message.offer_amount != null && (
        <div className="border border-primary/40 bg-primary/5 rounded px-3 py-2 text-xs font-mono">
          <span className="text-subtle uppercase tracking-wider">Offer: </span>
          <span className="text-primary font-bold">
            {message.offer_amount} {message.offer_currency || "USD"}
          </span>
        </div>
      )}
    </div>
  );
}
