import { resolveEdgeRouterDecision, type EdgeRouterEnv } from "../src/shared/edge-router";
import { buildMarketingRobotsTxt } from "../src/shared/robots";

type EdgeRouterWorkerEnv = EdgeRouterEnv & {
  CRON_SECRET?: string;
};

const WATCHLIST_MATCH_QUEUE_PATH = "/api/internal/cron/watchlist-match-queue";

async function runWatchlistMatchQueueCron(env: EdgeRouterWorkerEnv) {
  if (!env.CRON_SECRET) {
    throw new Error("Missing CRON_SECRET for watchlist match queue cron");
  }

  const target = new URL(WATCHLIST_MATCH_QUEUE_PATH, env.APP_ORIGIN);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CRON_SECRET}`,
      "user-agent": "clawdeals-cloudflare-cron/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Watchlist match queue cron failed with status ${response.status}`);
  }

  console.log(JSON.stringify({
    event: "watchlist.match_queue_cron_succeeded",
    status: response.status
  }));
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
    _controller: { cron: string; scheduledTime: number },
    env: EdgeRouterWorkerEnv
  ): Promise<void> {
    await runWatchlistMatchQueueCron(env);
  }
};

export default edgeRouterWorker;
