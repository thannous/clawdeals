import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

interface Props {
  message: any;
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
  question: "border-blue-400/40 text-blue-300 bg-blue-400/10",
  answer: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  info: "border-slate-400/40 text-slate-300 bg-slate-400/10",
  offer: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  counter_offer: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  accept: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  decline: "border-red-400/40 text-red-400 bg-red-400/10",
  cancel: "border-red-400/40 text-red-400 bg-red-400/10",
  warning: "border-yellow-400/40 text-yellow-400 bg-yellow-400/10",
};

export default function MessageCard({ message }: Props) {
  const payload = message?.payload && typeof message.payload === "object" ? message.payload : null;
  const messageType = message?.type || payload?.type || null;
  const senderType = message?.sender_type || "agent";
  const senderId = message?.sender_id || null;
  const isWarning = messageType === "warning" || Boolean(message?.redacted);

  const isOfferLike =
    messageType === "offer" ||
    messageType === "counter_offer" ||
    messageType === "accept" ||
    messageType === "decline" ||
    messageType === "cancel";

  const bodyText =
    typeof message?.body === "string" && message.body.trim()
      ? message.body
      : typeof payload?.text === "string" && payload.text.trim()
        ? payload.text
        : null;

  const offerRow = message?.offer && typeof message.offer === "object" ? message.offer : null;
  const offerAmount = offerRow?.amount ?? payload?.amount ?? null;
  const offerCurrency = offerRow?.currency ?? payload?.currency ?? null;
  const offerStatus = offerRow?.status ?? payload?.status ?? null;
  const offerExpiresAt = offerRow?.expires_at ?? payload?.expires_at ?? null;
  const offerPrev = payload?.previous_offer_id ?? offerRow?.previous_offer_id ?? null;

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
        {messageType && (
          <span
            className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
              TYPE_BADGE_CLASSES[String(messageType)] || "border-secondary/40 text-secondary bg-secondary/10"
            }`}
          >
            {messageType}
          </span>
        )}

        {/* Sender badge */}
        <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
          {senderType}
        </span>

        <TruncatedId id={senderId} chars={8} />

        {/* Redacted badge */}
        {message.redacted && (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-red-400/40 text-red-400 bg-red-400/10">
            REDACTED
          </span>
        )}

        {/* Warning highlight */}
        {messageType === "warning" && (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-yellow-400/40 text-yellow-400 bg-yellow-400/10">
            WARNING
          </span>
        )}

        <span className="ml-auto text-[10px] font-mono text-subtle tabular-nums">
          {formatDate(message.created_at)}
        </span>
      </div>

      {/* Body */}
      {bodyText && (
        <p className="text-sm font-mono text-text whitespace-pre-wrap break-words leading-relaxed">
          {bodyText}
        </p>
      )}

      {/* Non-text payload (e.g. offers) */}
      {isOfferLike && payload?.offer_id && (
        <div className="border border-primary/40 bg-primary/5 rounded px-3 py-2 text-xs font-mono space-y-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-subtle uppercase tracking-wider">Offer ID</span>
            <TruncatedId id={payload.offer_id} />
          </div>
          {(messageType === "counter_offer" || offerPrev) && offerPrev && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-subtle uppercase tracking-wider">Previous</span>
              <TruncatedId id={offerPrev} />
            </div>
          )}
          {offerAmount != null && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-subtle uppercase tracking-wider">Amount</span>
              <span className="text-text tabular-nums">
                {offerAmount} {offerCurrency || "\u2014"}
              </span>
            </div>
          )}
          {offerStatus && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-subtle uppercase tracking-wider">Status</span>
              <span className="text-text">{offerStatus}</span>
            </div>
          )}
          {offerExpiresAt && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-subtle uppercase tracking-wider">Expires</span>
              <span className="text-text tabular-nums">{formatDate(offerExpiresAt)}</span>
            </div>
          )}
        </div>
      )}

      {/* Fallback: show payload when there's no body */}
      {!bodyText && payload && !isOfferLike && (
        <pre className="text-xs font-mono text-muted whitespace-pre-wrap break-words leading-relaxed">
          {JSON.stringify(payload, null, 2).slice(0, 800)}
        </pre>
      )}
    </div>
  );
}
