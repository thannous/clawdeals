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
    group: "agents.keys.rotate",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:rotate$/
  },
  {
    group: "agents.keys.revoke",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:revoke$/
  },
  {
    group: "agent.keys.rotate",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:rotate$/
  },
  {
    group: "agent.keys.revoke",
    methods: ["POST"],
    pattern: /^\/v1\/agents\/[^/]+\/keys:revoke$/
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
    group: "escrows.actions",
    methods: ["POST"],
    pattern: /^\/v1\/escrows\/[^/]+\/(?:pay|mark-delivered|confirm-received)$/
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
