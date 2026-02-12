import Link from "next/link";
import TruncatedId from "../shared/TruncatedId";

interface Props {
  actionType: string | null;
  payload: any;
  actionRef?: any;
}

function resolveId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickFirstId(...values: unknown[]) {
  for (const v of values) {
    const resolved = resolveId(v);
    if (resolved) return resolved;
  }
  return null;
}

export default function ApprovalContextPreview({ actionType, payload, actionRef }: Props) {
  if (!payload || typeof payload !== "object") {
    return (
      <div className="text-xs font-mono text-muted">
        No context available
      </div>
    );
  }

  const entries = Object.entries(payload);
  const listingId = pickFirstId(payload?.listing_id, actionRef?.listing_id);
  const threadId = pickFirstId(payload?.thread_id, actionRef?.thread_id);
  const offer = payload?.offer && typeof payload.offer === "object" ? payload.offer : null;
  const policy = payload?.policy && typeof payload.policy === "object" ? payload.policy : null;
  const quarantineApplied =
    typeof payload?.quarantine_applied === "boolean" ? payload.quarantine_applied : null;

  const usedKeys = new Set<string>();
  if (listingId) usedKeys.add("listing_id");
  if (threadId) usedKeys.add("thread_id");
  if (offer) usedKeys.add("offer");
  if (policy) usedKeys.add("policy");
  if (quarantineApplied !== null) usedKeys.add("quarantine_applied");

  if (actionType?.startsWith("listing.")) {
    return (
      <div className="space-y-2">
        {payload.title && (
          <div>
            <span className="text-xs font-mono text-subtle uppercase tracking-wider">Title: </span>
            <span className="text-xs font-mono text-text">{payload.title}</span>
          </div>
        )}
        {payload.price != null && (
          <div>
            <span className="text-xs font-mono text-subtle uppercase tracking-wider">Price: </span>
            <span className="text-xs font-mono text-primary">{payload.price} {payload.currency || "USD"}</span>
          </div>
        )}
        {payload.category && (
          <div>
            <span className="text-xs font-mono text-subtle uppercase tracking-wider">Category: </span>
            <span className="text-xs font-mono text-text">{payload.category}</span>
          </div>
        )}
        {payload.condition && (
          <div>
            <span className="text-xs font-mono text-subtle uppercase tracking-wider">Condition: </span>
            <span className="text-xs font-mono text-text">{payload.condition}</span>
          </div>
        )}
      </div>
    );
  }

  if (actionType?.startsWith("thread.")) {
    return (
      <div className="space-y-2">
        {payload.message_type && (
          <div>
            <span className="text-xs font-mono text-subtle uppercase tracking-wider">Type: </span>
            <span className="text-xs font-mono text-text">{payload.message_type}</span>
          </div>
        )}
        {payload.body && (
          <div>
            <span className="text-xs font-mono text-subtle uppercase tracking-wider">Body: </span>
            <span className="text-xs font-mono text-text whitespace-pre-wrap break-words">
              {String(payload.body).slice(0, 500)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Common context (console-friendly)
  return (
    <div className="space-y-3">
      {(listingId || threadId) && (
        <div className="space-y-1">
          {listingId && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Listing</span>
              <Link href={`/console/listings/${listingId}`} className="text-xs font-mono text-primary hover:underline">
                <TruncatedId id={listingId} />
              </Link>
            </div>
          )}
          {threadId && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Thread</span>
              <Link href={`/console/threads/${threadId}`} className="text-xs font-mono text-primary hover:underline">
                <TruncatedId id={threadId} />
              </Link>
            </div>
          )}
        </div>
      )}

      {offer && (
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">Offer</div>
          {"amount" in offer && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Amount</span>
              <span className="text-xs font-mono text-text tabular-nums">
                {offer.amount} {offer.currency || "USD"}
              </span>
            </div>
          )}
          {offer.expires_at && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Expires</span>
              <span className="text-xs font-mono text-text tabular-nums">{String(offer.expires_at)}</span>
            </div>
          )}
        </div>
      )}

      {policy && (
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">Policy</div>
          {policy.decision && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Decision</span>
              <span className="text-xs font-mono text-text">{String(policy.decision)}</span>
            </div>
          )}
          {"reason" in policy && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Reason</span>
              <span className="text-xs font-mono text-text">{policy.reason ? String(policy.reason) : "\u2014"}</span>
            </div>
          )}
          {"policy_version" in policy && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">Version</span>
              <span className="text-xs font-mono text-text tabular-nums">
                {policy.policy_version != null ? String(policy.policy_version) : "\u2014"}
              </span>
            </div>
          )}
        </div>
      )}

      {quarantineApplied !== null && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-mono text-subtle uppercase tracking-wider">Quarantine</span>
          <span className="text-xs font-mono text-text">{quarantineApplied ? "Yes" : "No"}</span>
        </div>
      )}

      <div className="space-y-1">
        {entries
          .filter(([key]) => !usedKeys.has(key))
          .slice(0, 10)
          .map(([key, val]) => (
            <div key={key}>
              <span className="text-xs font-mono text-subtle uppercase tracking-wider">{key}: </span>
              <span className="text-xs font-mono text-text">
                {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
