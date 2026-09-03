const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_LIMIT_DEFAULT_SCOPE = "agent";
export const RATE_LIMIT_KEY_PREFIX = "rl";

export const RATE_LIMIT_PROFILES = {
  "acquisition.events_ip": {
    scope: "ip",
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 300, windowSeconds: HOUR },
    ],
  },
  "webmcp.tool_invoke": {
    // Additional safety bucket for in-browser agent tool invocation to prevent noisy loops.
    scope: "agent",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },

  "auth.register_ip": {
    scope: "ip",
    buckets: [{ limit: 5, windowSeconds: HOUR }],
  },
  "alerts.write_ip": {
    scope: "ip",
    buckets: [
      { limit: 5, windowSeconds: MINUTE },
      { limit: 20, windowSeconds: DAY },
    ],
  },
  "alerts.confirm_ip": {
    scope: "ip",
    buckets: [{ limit: 30, windowSeconds: MINUTE }],
  },
  "auth.me.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "auth.session.start": {
    scope: "ip",
    buckets: [
      { limit: 10, windowSeconds: MINUTE },
      { limit: 100, windowSeconds: HOUR },
    ],
  },
  "auth.session.confirm": {
    scope: "ip",
    buckets: [
      { limit: 20, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "auth.session.end": {
    scope: "ip",
    buckets: [{ limit: 120, windowSeconds: HOUR }],
  },
  "agents.me.read": {
    scope: "agent",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "agents.me.write": {
    scope: "agent",
    buckets: [{ limit: 30, windowSeconds: MINUTE }],
  },
  "agents.me.claim_owner": {
    scope: "agent",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  // TI-312: OAuth device authorization (RFC 8628).
  "oauth.device.authorize_ip": {
    scope: "ip",
    buckets: [
      { limit: 5, windowSeconds: MINUTE },
      { limit: 60, windowSeconds: HOUR },
    ],
  },
  "oauth.device.requests.read_ip": {
    scope: "ip",
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 300, windowSeconds: HOUR },
    ],
  },
  "oauth.device.approve_ip": {
    scope: "ip",
    buckets: [
      { limit: 20, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "oauth.device.deny_ip": {
    scope: "ip",
    buckets: [
      { limit: 20, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  // TI-313: OAuth token issuance/refresh + revocation (RFC 7009).
  "oauth.token": {
    scope: "agent",
    buckets: [{ limit: 30, windowSeconds: 10 * MINUTE }],
  },
  "oauth.revoke": {
    scope: "owner",
    buckets: [{ limit: 30, windowSeconds: HOUR }],
  },
  // TI-309/TI-310: OpenClaw connect (claim link) sessions.
  "connect.sessions.create_ip": {
    scope: "ip",
    buckets: [
      { limit: 2, windowSeconds: MINUTE },
      { limit: 10, windowSeconds: HOUR },
    ],
  },
  "connect.claims.read": {
    scope: "ip",
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 300, windowSeconds: HOUR },
    ],
  },
  "connect.sessions.poll_token": {
    // Scoped by poll_token_hash (not raw token).
    scope: "agent",
    buckets: [{ limit: 60, windowSeconds: MINUTE }],
  },
  "connect.sessions.claim_owner": {
    scope: "owner",
    buckets: [
      { limit: 20, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "connect.sessions.deny_owner": {
    scope: "owner",
    buckets: [
      { limit: 20, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "connect.sessions.exchange": {
    // Scoped by poll_token_hash (not raw token).
    scope: "agent",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "connect.sessions.exchange_ip": {
    scope: "ip",
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 300, windowSeconds: HOUR },
    ],
  },
  "agents.keys.rotate": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "agents.keys.rotate_all": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "agents.keys.revoke": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "agents.keys.revoke_all": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "agent.keys.rotate": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "agent.keys.rotate_all": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "agent.keys.revoke": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "agent.keys.revoke_all": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "installations.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "installations.revoke": {
    scope: "owner",
    buckets: [{ limit: 20, windowSeconds: HOUR }],
  },
  "installations.rotate": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: HOUR }],
  },
  "installations.scopes_upgrade": {
    scope: "owner",
    buckets: [{ limit: 10, windowSeconds: DAY }],
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
  "deals.update": {
    buckets: [{ limit: 60, windowSeconds: DAY }],
  },
  "deals.delete": {
    buckets: [{ limit: 60, windowSeconds: DAY }],
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
  "chat.commands.stage": {
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "chat.commands.confirm": {
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "chat.commands.cancel": {
    buckets: [
      { limit: 60, windowSeconds: MINUTE },
      { limit: 300, windowSeconds: HOUR },
    ],
  },
  "chat.commands.undo": {
    buckets: [
      { limit: 30, windowSeconds: MINUTE },
      { limit: 200, windowSeconds: HOUR },
    ],
  },
  "watchlist.match": {
    buckets: [{ limit: 60, windowSeconds: MINUTE }],
  },
  "notifications.prefs.update": {
    scope: "owner",
    buckets: [{ limit: 30, windowSeconds: HOUR }],
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
  "threads.watch": {
    // Long-poll consumer. Keep this tight enough to prevent tight-loop polling.
    buckets: [{ limit: 60, windowSeconds: MINUTE }],
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
  "escrows.pay": {
    buckets: [{ limit: 200, windowSeconds: DAY }],
  },
  "escrows.mark_delivered": {
    buckets: [{ limit: 200, windowSeconds: DAY }],
  },
  "escrows.confirm_received": {
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
  "console.reports.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "console.reports.write": {
    scope: "owner",
    buckets: [{ limit: 500, windowSeconds: HOUR }],
  },
  "console.ops.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "console.risk_rules.read": {
    scope: "owner",
    buckets: [{ limit: 240, windowSeconds: MINUTE }],
  },
  "console.risk_rules.write": {
    scope: "owner",
    buckets: [{ limit: 200, windowSeconds: HOUR }],
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
  "owner.identities.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.activity.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.policy_decisions.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.agents.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.claims.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.deals.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.listings.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.offers.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.threads.read": {
    scope: "owner",
    buckets: [{ limit: 120, windowSeconds: MINUTE }],
  },
  "owner.identities.write": {
    scope: "owner",
    buckets: [{ limit: 30, windowSeconds: HOUR }],
  },
  "owner.identities.delete": {
    scope: "owner",
    buckets: [{ limit: 30, windowSeconds: HOUR }],
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
  "channels.telegram.start": {
    scope: "channel",
    buckets: [
      { limit: 2, windowSeconds: 30 },
      { limit: 5, windowSeconds: 10 * MINUTE },
      { limit: 20, windowSeconds: DAY },
    ],
  },
  "channels.telegram.callback": {
    scope: "channel",
    buckets: [
      { limit: 10, windowSeconds: 30 },
      { limit: 60, windowSeconds: MINUTE },
    ],
  },
  "channels.telegram.text": {
    scope: "channel",
    buckets: [
      { limit: 5, windowSeconds: 30 },
      { limit: 20, windowSeconds: MINUTE },
      { limit: 100, windowSeconds: DAY },
    ],
  },
  "channels.telegram.media_upload": {
    scope: "owner",
    buckets: [{ limit: 100, windowSeconds: DAY }],
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

  // Chat UI navigation (Telegram inline keyboard).
  "chat.menu": {
    scope: "channel",
    buckets: [
      { limit: 6, windowSeconds: 30 },
      { limit: 120, windowSeconds: DAY },
    ],
  },
  "chat.nav": {
    scope: "channel",
    buckets: [
      { limit: 20, windowSeconds: 30 },
      { limit: 500, windowSeconds: DAY },
    ],
  },
  "chat.search": {
    scope: "channel",
    buckets: [
      { limit: 10, windowSeconds: 30 },
      { limit: 200, windowSeconds: DAY },
    ],
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
