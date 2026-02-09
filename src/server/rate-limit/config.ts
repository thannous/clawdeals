const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_LIMIT_DEFAULT_SCOPE = "agent";
export const RATE_LIMIT_KEY_PREFIX = "rl";

export const RATE_LIMIT_PROFILES = {
  "auth.register_ip": {
    scope: "ip",
    buckets: [{ limit: 5, windowSeconds: HOUR }],
  },
  "agents.keys.rotate": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "agents.keys.revoke": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "agent.keys.rotate": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "agent.keys.revoke": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "policies.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "policies.write": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "approvals.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "approvals.approve": {
    scope: "owner",
    buckets: [{ limit: 60, windowSeconds: HOUR }],
  },
  "approvals.deny": {
    scope: "owner",
    buckets: [{ limit: 60, windowSeconds: HOUR }],
  },
  "approvals.write": {
    scope: "owner",
    buckets: [{ limit: 60, windowSeconds: HOUR }],
  },
  "console.approvals.write": {
    // Ops console can legitimately perform many moderation actions in a short window.
    // Keep this separate from owner-facing approvals.write to avoid relaxing production limits.
    scope: "owner",
    buckets: [{ limit: 500, windowSeconds: HOUR }],
  },
  "deals.create": {
    buckets: [{ limit: 20, windowSeconds: DAY }],
  },
  "deals.read": {
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "deals.vote": {
    buckets: [{ limit: 120, windowSeconds: HOUR }],
  },
  "deals.comments.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "deals.comments.create": {
    scope: "owner",
    buckets: [{ limit: 30, windowSeconds: MINUTE }],
  },
  "watchlists.write": {
    buckets: [
      { limit: 5, windowSeconds: MINUTE },
      { limit: 50, windowSeconds: DAY },
    ],
  },
  "watchlists.read": {
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "watchlist.match": {
    buckets: [{ limit: 60, windowSeconds: MINUTE }],
  },
  "listings.create": {
    buckets: [{ limit: 50, windowSeconds: DAY }],
  },
  "listings.write": {
    buckets: [{ limit: 30, windowSeconds: DAY }],
  },
  "listings.read": {
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "threads.create": {
    buckets: [{ limit: 50, windowSeconds: DAY }],
  },
  "threads.read": {
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "audit.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "audit.export": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "messages.send": {
    buckets: [
      { limit: 30, windowSeconds: 10 * MINUTE },
      { limit: 300, windowSeconds: DAY },
    ],
  },
  "offers.create": {
    buckets: [{ limit: 50, windowSeconds: DAY }],
  },
  "offers.actions": {
    buckets: [{ limit: 100, windowSeconds: DAY }],
  },
  "transactions.actions": {
    buckets: [{ limit: 50, windowSeconds: DAY }],
  },
  "escrows.create": {
    buckets: [{ limit: 50, windowSeconds: DAY }],
  },
  "escrows.actions": {
    buckets: [{ limit: 200, windowSeconds: DAY }],
  },
  "disputes.open": {
    scope: "owner",
    buckets: [
      { limit: 1, windowSeconds: 10 * MINUTE },
      { limit: 3, windowSeconds: 30 * DAY },
    ],
  },
  "disputes.resolve": {
    scope: "owner",
    buckets: [{ limit: 60, windowSeconds: HOUR }],
  },
  "ratings.create": {
    buckets: [{ limit: 20, windowSeconds: DAY }],
  },
  "ops.psp.write": {
    scope: "owner",
    buckets: [{ limit: 200, windowSeconds: HOUR }],
  },
  "ops.psp.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "sandbox.reset": {
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "sellers.psp.write": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: DAY }],
  },
  "sellers.psp.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "psp.webhooks": {
    scope: "ip",
    buckets: [{ limit: 600, windowSeconds: MINUTE }],
  },
  "evidence.write": {
    scope: "owner",
    buckets: [
      { limit: 10, windowSeconds: MINUTE },
      { limit: 100, windowSeconds: DAY },
    ],
  },
  "evidence.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "offers.write": {
    buckets: [{ limit: 200, windowSeconds: DAY }],
  },
  "contact_reveal.request": {
    buckets: [{ limit: 10, windowSeconds: DAY }],
  },
  "contact_reveal.resolve": {
    scope: "owner",
    buckets: [{ limit: 500, windowSeconds: HOUR }],
  },
  "reports.create": {
    buckets: [
      { limit: 20, windowSeconds: DAY },
      { limit: 5, windowSeconds: MINUTE },
    ],
  },
  "owner.verify_email_start": {
    scope: "owner",
    buckets: [{ limit: 5, windowSeconds: HOUR }],
  },
  "owner.verify_email_confirm": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "owner.verify_phone_start": {
    scope: "owner",
    buckets: [{ limit: 5, windowSeconds: HOUR }],
  },
  "owner.verify_phone_confirm": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "sse.connect": {
    // SSE concurrency is enforced separately via acquire/release slots.
    // Keep this as a (generous) connect-rate guard to avoid reconnect storms.
    buckets: [{ limit: 60, windowSeconds: MINUTE }],
  },
  "sse.reconnect_ip": {
    scope: "ip",
    buckets: [{ limit: 10, windowSeconds: 10 * MINUTE }],
  },

  // Phase 5: multi-canal (Telegram) + pairing allowlists.
  "channels.pairings.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "channels.pairings.write": {
    scope: "owner",
    buckets: [{ limit: 60, windowSeconds: HOUR }],
  },
  "channels.pairing_confirm": {
    scope: "owner",
    buckets: [{ limit: 30, windowSeconds: HOUR }],
  },
  "channels.telegram.webhook": {
    scope: "channel",
    buckets: [
      { limit: 5, windowSeconds: 10 },
      { limit: 30, windowSeconds: MINUTE },
    ],
  },
  "channels.pair": {
    scope: "channel",
    buckets: [
      { limit: 3, windowSeconds: 10 * MINUTE },
      { limit: 20, windowSeconds: DAY },
    ],
  },
  "channels.confirm": {
    scope: "channel",
    buckets: [{ limit: 10, windowSeconds: 10 * MINUTE }],
  },
  "console.moderation.write": {
    scope: "owner",
    buckets: [{ limit: 200, windowSeconds: HOUR }],
  },
  "console.moderation.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
};

export function formatWindow(windowSeconds) {
  if (windowSeconds % DAY === 0) {
    return `${windowSeconds / DAY}d`;
  }
  if (windowSeconds % HOUR === 0) {
    return `${windowSeconds / HOUR}h`;
  }
  if (windowSeconds % MINUTE === 0) {
    return `${windowSeconds / MINUTE}m`;
  }
  return `${windowSeconds}s`;
}

export function formatLimitLabel(limit, windowSeconds) {
  return `${limit}/${formatWindow(windowSeconds)}`;
}

export function normalizeKeyPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._:-]/g, "_");
}

export function getProfileForGroup(group: string, overrides?: any) {
  const profiles = overrides || RATE_LIMIT_PROFILES;
  return profiles[group] || null;
}

export const RATE_LIMIT_TIME = {
  SECOND,
  MINUTE,
  HOUR,
  DAY,
};
