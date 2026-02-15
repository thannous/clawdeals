import { resolveEdgeRouterDecision, type EdgeRouterEnv } from "../src/shared/edge-router";

function withForwardHeaders(request: Request, target: string): Request {
  const sourceUrl = new URL(request.url);
  const upstream = new Request(target, request);
  const headers = new Headers(upstream.headers);

  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));

  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  return new Request(upstream, { headers });
}

export default {
  async fetch(request: Request, env: EdgeRouterEnv): Promise<Response> {
    const decision = resolveEdgeRouterDecision(new URL(request.url), env);

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
  }
};
