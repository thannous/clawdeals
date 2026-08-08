import { resolveEdgeRouterDecision, type EdgeRouterEnv } from "../src/shared/edge-router";
import { buildMarketingRobotsTxt } from "../src/shared/robots";

type EdgeRouterWorkerEnv = EdgeRouterEnv & {
  CRON_SECRET?: string;
};

// Every internal cron endpoint must be reachable from a scheduler; this worker is
// the only always-on one. Trigger expressions must match wrangler.jsonc `triggers.crons`.
// The daily full trustscore sweep stays on Vercel cron (vercel.json, 03:00 UTC).
const FAST_LANE_CRON = "*/5 * * * *";

const CRON_JOBS: Record<string, readonly string[]> = {
  // Queue drains and time-sensitive expirations.
  [FAST_LANE_CRON]: [
    "/api/internal/cron/watchlist-match-queue",
    "/api/internal/cron/watchlist-backfill-queue",
    "/api/internal/cron/notifications-dispatch",
    "/api/internal/cron/offers-expiration",
    "/api/internal/cron/trustscore-recalc-queue"
  ],
  // Hourly lifecycle + monitoring.
  "17 * * * *": [
    "/api/internal/cron/deals-lifecycle",
    "/api/internal/cron/transactions-auto-close",
    "/api/internal/cron/risk-rules",
    "/api/internal/cron/observability-alerts"
  ],
  // Daily digest + retention, before the 03:00 UTC Vercel trustscore sweep.
  "10 2 * * *": [
    "/api/internal/cron/watchlist-digest",
    "/api/internal/cron/audit-retention",
    "/api/internal/cron/reports-retention",
    "/api/internal/cron/idempotency-retention",
    "/api/internal/cron/partition-maintenance"
  ]
};

async function runCronEndpoint(env: EdgeRouterWorkerEnv, path: string) {
  const target = new URL(path, env.APP_ORIGIN);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CRON_SECRET}`,
      "user-agent": "clawdeals-cloudflare-cron/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Cron ${path} failed with status ${response.status}`);
  }

  console.log(JSON.stringify({
    event: "cron.dispatch_succeeded",
    path,
    status: response.status
  }));
}

async function runScheduledCrons(cron: string, env: EdgeRouterWorkerEnv) {
  if (!env.CRON_SECRET) {
    throw new Error("Missing CRON_SECRET for internal cron dispatch");
  }

  const paths = CRON_JOBS[cron] ?? CRON_JOBS[FAST_LANE_CRON];
  if (!CRON_JOBS[cron]) {
    console.log(JSON.stringify({ event: "cron.unknown_trigger", cron }));
  }

  const results = await Promise.allSettled(paths.map((path) => runCronEndpoint(env, path)));
  const failures = results
    .map((result, index) => (result.status === "rejected" ? { path: paths[index], reason: String(result.reason) } : null))
    .filter((entry): entry is { path: string; reason: string } => entry !== null);

  if (failures.length > 0) {
    console.log(JSON.stringify({ event: "cron.dispatch_failed", cron, failures }));
    throw new Error(`Cron dispatch failed for ${failures.map((f) => f.path).join(", ")}`);
  }
}

function withForwardHeaders(request: Request, target: string): Request {
  const sourceUrl = new URL(request.url);
  const upstream = new Request(target, request);
  const headers = new Headers(upstream.headers);

  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));

  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  headers.set("x-edge-router-proxy", "marketing");

  return new Request(upstream, { headers });
}

const edgeRouterWorker = {
  async fetch(request: Request, env: EdgeRouterWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const decision = resolveEdgeRouterDecision(url, env);

    // Serve marketing robots.txt at the edge to avoid upstream cache poisoning
    // between app-host and proxied-marketing variants.
    if (decision.type === "proxy" && url.pathname === "/robots.txt") {
      const sitemapUrl = `${url.origin}/sitemap.xml`;
      return new Response(buildMarketingRobotsTxt(sitemapUrl), {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300"
        }
      });
    }

    if (decision.type === "redirect") {
      return Response.redirect(decision.location, decision.status);
    }

    if (decision.type === "proxy") {
      return fetch(withForwardHeaders(request, decision.target), { redirect: "manual" });
    }

    if (decision.type === "error") {
      return new Response(decision.message, {
        status: decision.status,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    return fetch(request);
  },

  async scheduled(
    controller: { cron: string; scheduledTime: number },
    env: EdgeRouterWorkerEnv
  ): Promise<void> {
    await runScheduledCrons(controller.cron, env);
  }
};

export default edgeRouterWorker;
