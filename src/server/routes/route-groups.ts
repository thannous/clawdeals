type RouteGroupMatcher = {
  group: string;
  methods?: string[];
  pattern: RegExp;
  query?: (searchParams: URLSearchParams) => boolean;
};

const ROUTE_GROUPS: RouteGroupMatcher[] = [
  {
    group: "audit.read",
    methods: ["GET"],
    pattern: /^\/v1\/audit$/
  },
  {
    group: "audit.export",
    methods: ["GET"],
    pattern: /^\/v1\/audit\/export$/
  },
  {
    group: "auth.register_ip",
    methods: ["POST"],
    pattern: /^\/v1\/agents$/
  },
  {
    group: "auth.me.read",
    methods: ["GET"],
    pattern: /^\/v1\/auth\/(?:me|session)$/
  },
  {
    group: "auth.session.start",
    methods: ["POST"],
    pattern: /^\/v1\/auth\/(?:login:start|session:start|session:login)$/
  },
  {
    group: "auth.session.confirm",
    methods: ["POST"],
    pattern: /^\/v1\/auth\/(?:login:confirm|session:confirm|session:verify)$/
  },
  {
    group: "auth.session.end",
    methods: ["POST"],
    pattern: /^\/v1\/auth\/(?:logout|session:clear|session:logout|session:end)$/
  },
  {
    group: "agents.me.read",
    methods: ["GET"],
    pattern: /^\/v1\/agents\/me$/
  },
  {
    group: "agents.me.write",
    methods: ["PATCH"],
    pattern: /^\/v1\/agents\/me$/
  },
  {
    group: "connect.sessions.create_ip",
    methods: ["POST"],
    pattern: /^\/v1\/connect\/sessions$/
  },
  {
    group: "connect.sessions.poll_token",
    methods: ["GET"],
    pattern: /^\/v1\/connect\/sessions\/[^/]+$/
  },
  {
    group: "connect.claims.read",
    methods: ["GET"],
    pattern: /^\/v1\/connect\/claims\/[^/]+$/
  },
  {
    group: "connect.sessions.claim_owner",
    methods: ["POST"],
    pattern: /^\/v1\/connect\/sessions\/[^/]+\/claim$/
  },
  {
    group: "connect.sessions.deny_owner",
    methods: ["POST"],
    pattern: /^\/v1\/connect\/sessions\/[^/]+\/deny$/
  },
  {
    group: "connect.sessions.exchange",
    methods: ["POST"],
    pattern: /^\/v1\/connect\/sessions\/[^/]+\/exchange$/
  },
  {
    group: "agents.keys.rotate",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:rotate$/
  },
  {
    group: "agents.keys.rotate_all",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:rotate-all$/
  },
  {
    group: "agents.keys.revoke",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:revoke$/
  },
  {
    group: "agents.keys.revoke_all",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:revoke-all$/
  },
  {
    group: "agent.keys.rotate",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:rotate$/
  },
  {
    group: "agent.keys.rotate_all",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:rotate-all$/
  },
  {
    group: "agent.keys.revoke",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:revoke$/
  },
  {
    group: "agent.keys.revoke_all",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:revoke-all$/
  },
  {
    group: "owner.verify_email_start",
    methods: ["POST"],
    pattern: /^\/v1\/owner\/verify-email:start$/
  },
  {
    group: "owner.verify_email_confirm",
    methods: ["POST"],
    pattern: /^\/v1\/owner\/verify-email:confirm$/
  },
  {
    group: "owner.verify_phone_start",
    methods: ["POST"],
    pattern: /^\/v1\/owner\/verify-phone:start$/
  },
  {
    group: "owner.verify_phone_confirm",
    methods: ["POST"],
    pattern: /^\/v1\/owner\/verify-phone:confirm$/
  },
  {
    group: "owner.identities.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/identities(?:\/[^/]+)?$/
  },
  {
    group: "owner.activity.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/activity$/
  },
  {
    group: "owner.deals.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/deals$/
  },
  {
    group: "owner.listings.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/listings$/
  },
  {
    group: "owner.listings.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/listings\/[^/]+$/
  },
  {
    group: "owner.offers.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/offers$/
  },
  {
    group: "owner.threads.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/threads$/
  },
  {
    group: "owner.identities.write",
    methods: ["POST"],
    pattern: /^\/v1\/owner\/identities$/
  },
  {
    group: "owner.identities.delete",
    methods: ["DELETE"],
    pattern: /^\/v1\/owner\/identities\/[^/]+$/
  },
  {
    group: "installations.read",
    methods: ["GET"],
    pattern: /^\/v1\/owner\/installations$/
  },
  {
    group: "installations.read",
    methods: ["GET"],
    pattern: /^\/v1\/installations$/
  },
  {
    group: "installations.revoke",
    methods: ["POST"],
    pattern: /^\/v1\/installations\/[^/]+:revoke$/
  },
  {
    group: "installations.rotate",
    methods: ["POST"],
    pattern: /^\/v1\/installations\/[^/]+:rotate$/
  },
  {
    group: "installations.scopes_upgrade",
    methods: ["POST"],
    pattern: /^\/v1\/installations\/[^/]+:scopes-upgrade$/
  },
  // Console wrappers (browser) reuse v1 handlers under /api/console/*.
  {
    group: "installations.revoke",
    methods: ["POST"],
    pattern: /^\/console\/installations\/[^/]+:revoke$/
  },
  {
    group: "installations.rotate",
    methods: ["POST"],
    pattern: /^\/console\/installations\/[^/]+:rotate$/
  },
  {
    group: "installations.scopes_upgrade",
    methods: ["POST"],
    pattern: /^\/console\/installations\/[^/]+:scopes-upgrade$/
  },
  {
    group: "policies.read",
    methods: ["GET"],
    pattern: /^\/v1\/policies(?:\/[^/]+)?$/
  },
  {
    group: "policies.write",
    methods: ["PUT", "PATCH"],
    pattern: /^\/v1\/policies(?:\/[^/]+)?$/
  },
  {
    group: "approvals.read",
    methods: ["GET"],
    pattern: /^\/v1\/approvals$/
  },
  {
    group: "approvals.read",
    methods: ["GET"],
    pattern: /^\/v1\/approvals\/[^/]+$/
  },
  {
    group: "approvals.approve",
    methods: ["POST"],
    pattern: /^\/v1\/approvals\/[^/]+:approve$/
  },
  {
    group: "approvals.deny",
    methods: ["POST"],
    pattern: /^\/v1\/approvals\/[^/]+:deny$/
  },
  {
    group: "deals.read",
    methods: ["GET"],
    pattern: /^\/v1\/deals$/
  },
  {
    group: "deals.read",
    methods: ["GET"],
    pattern: /^\/v1\/deals\/[^/]+$/
  },
  {
    group: "deals.update",
    methods: ["PATCH"],
    pattern: /^\/v1\/deals\/[^/]+$/
  },
  {
    group: "deals.delete",
    methods: ["DELETE"],
    pattern: /^\/v1\/deals\/[^/]+$/
  },
  {
    group: "deals.read",
    methods: ["GET"],
    pattern: /^\/v1\/deals\/[^/]+\/votes$/
  },
  {
    group: "deals.comments.read",
    methods: ["GET"],
    pattern: /^\/v1\/deals\/[^/]+\/comments$/
  },
  {
    group: "deals.comments.create",
    methods: ["POST"],
    pattern: /^\/v1\/deals\/[^/]+\/comments$/
  },
  {
    group: "deals.create",
    methods: ["POST"],
    pattern: /^\/v1\/deals$/
  },
  {
    group: "deals.vote",
    methods: ["POST"],
    pattern: /^\/v1\/deals\/[^/]+\/vote$/
  },
  {
    group: "watchlists.write",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    pattern: /^\/v1\/watchlists(?:\/[^/]+)?$/
  },
  {
    group: "watchlists.read",
    methods: ["GET"],
    pattern: /^\/v1\/watchlists(?:\/.*)?$/
  },
  {
    group: "chat.commands.stage",
    methods: ["POST"],
    pattern: /^\/v1\/chat\/commands:stage$/
  },
  {
    group: "chat.commands.confirm",
    methods: ["POST"],
    pattern: /^\/v1\/chat\/commands\/[^/]+:confirm$/
  },
  {
    group: "chat.commands.cancel",
    methods: ["POST"],
    pattern: /^\/v1\/chat\/commands\/[^/]+:cancel$/
  },
  {
    group: "chat.commands.undo",
    methods: ["POST"],
    pattern: /^\/v1\/chat\/commands\/[^/]+:undo$/
  },
  {
    group: "listings.create",
    methods: ["POST"],
    pattern: /^\/v1\/listings$/
  },
  {
    group: "listings.write",
    methods: ["PUT", "PATCH"],
    pattern: /^\/v1\/listings\/[^/]+$/
  },
  {
    group: "listings.read",
    methods: ["GET"],
    pattern: /^\/v1\/listings(?:\/.*)?$/
  },
  {
    group: "threads.create",
    methods: ["POST"],
    pattern: /^\/v1\/listings\/[^/]+\/threads$/
  },
  {
    group: "threads.read",
    methods: ["GET"],
    pattern: /^\/v1\/threads(?:\/[^/]+)?$/
  },
  {
    group: "messages.send",
    methods: ["POST"],
    pattern: /^\/v1\/threads\/[^/]+\/messages$/
  },
  {
    group: "threads.watch",
    methods: ["POST"],
    pattern: /^\/v1\/threads\/[^/]+:watch$/
  },
  {
    group: "offers.create",
    methods: ["POST"],
    pattern: /^\/v1\/listings\/[^/]+\/offers$/
  },
  {
    group: "offers.actions",
    methods: ["POST"],
    pattern: /^\/v1\/offers\/[^/]+\/(?:accept|decline|cancel)$/
  },
  {
    group: "transactions.actions",
    methods: ["POST"],
    pattern: /^\/v1\/transactions\/[^/]+\/mark-completed$/
  },
  {
    group: "contact_reveal.request",
    methods: ["POST"],
    pattern: /^\/v1\/transactions\/[^/]+\/request-contact-reveal$/
  },
  {
    group: "escrows.create",
    methods: ["POST"],
    pattern: /^\/v1\/transactions\/[^/]+\/escrow:create$/
  },
  {
    group: "ratings.create",
    methods: ["POST"],
    pattern: /^\/v1\/transactions\/[^/]+\/ratings$/
  },
  {
    group: "escrows.pay",
    methods: ["POST"],
    pattern: /^\/v1\/escrows\/[^/]+\/pay$/
  },
  {
    group: "escrows.mark_delivered",
    methods: ["POST"],
    pattern: /^\/v1\/escrows\/[^/]+\/mark-delivered$/
  },
  {
    group: "escrows.confirm_received",
    methods: ["POST"],
    pattern: /^\/v1\/escrows\/[^/]+\/confirm-received$/
  },
  {
    group: "disputes.open",
    methods: ["POST"],
    pattern: /^\/v1\/escrows\/[^/]+\/disputes$/
  },
  {
    group: "disputes.resolve",
    methods: ["POST"],
    pattern: /^\/v1\/disputes\/[^/]+\/resolve$/
  },
  {
    group: "evidence.write",
    methods: ["POST"],
    pattern: /^\/v1\/disputes\/[^/]+\/(?:evidence|evidence:confirm)$/
  },
  {
    group: "evidence.read",
    methods: ["GET"],
    pattern: /^\/v1\/disputes\/[^/]+\/evidence$/
  },
  {
    group: "offers.write",
    methods: ["POST", "PUT", "PATCH"],
    pattern: /^\/v1\/offers\/[^/]+(?:\/.*)?$/
  },
  {
    group: "ops.psp.write",
    methods: ["POST"],
    pattern: /^\/v1\/ops\/psp\/configure$/
  },
  {
    group: "ops.psp.read",
    methods: ["GET"],
    pattern: /^\/v1\/ops\/psp\/status$/
  },
  {
    group: "sandbox.reset",
    methods: ["GET", "POST"],
    pattern: /^\/v1\/sandbox\/(?:reset|seller-turn)$/
  },
  {
    group: "sellers.psp.write",
    methods: ["POST"],
    pattern: /^\/v1\/sellers\/psp:onboard$/
  },
  {
    group: "sellers.psp.read",
    methods: ["GET"],
    pattern: /^\/v1\/sellers\/psp:status$/
  },
  {
    group: "psp.webhooks",
    methods: ["POST"],
    pattern: /^\/v1\/psp\/webhooks$/
  },
  {
    group: "reports.create",
    methods: ["POST"],
    pattern: /^\/v1\/reports$/
  },
  {
    group: "channels.telegram.webhook",
    methods: ["POST"],
    pattern: /^\/v1\/channels\/telegram\/webhook(?:\/[^/]+)?$/
  },
  {
    group: "sse.connect",
    methods: ["GET"],
    pattern: /^\/v1\/events\/stream$/
  }
];

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }
  const trimmed = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (trimmed.startsWith("/api/")) {
    return trimmed.slice(4) || "/";
  }
  if (trimmed === "/api") {
    return "/";
  }
  return trimmed;
}

function getHeaderValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function matchRouteGroup(method, pathname, searchParams) {
  const normalizedMethod = method?.toUpperCase();
  const path = normalizePath(pathname);

  for (const route of ROUTE_GROUPS) {
    if (route.methods && normalizedMethod && !route.methods.includes(normalizedMethod)) {
      continue;
    }
    if (!route.pattern.test(path)) {
      continue;
    }
    if (route.query && !route.query(searchParams)) {
      continue;
    }
    return route.group;
  }

  return null;
}

export function matchRouteGroupFromRequest(request) {
  if (!request) {
    return null;
  }
  const url = new URL(request.url, "http://localhost");
  let group = matchRouteGroup(request.method, url.pathname, url.searchParams);

  if (group === "sse.connect") {
    const lastEventId = getHeaderValue(request.headers, "last-event-id");
    const reconnectParam =
      url.searchParams.has("reconnect") ||
      url.searchParams.has("last_event_id") ||
      url.searchParams.has("lastEventId");
    if (lastEventId || reconnectParam) {
      group = "sse.reconnect_ip";
    }
  }

  return group;
}

export const ROUTE_GROUP_MATCHERS = ROUTE_GROUPS;
