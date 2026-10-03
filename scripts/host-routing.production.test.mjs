// Run after `npm run build`: exercises Next's registered routing, not imported functions.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { after, before, test } from "node:test";
import { resolveEdgeRouterDecision } from "../src/shared/edge-router.ts";

const app = "app.clawdeals.com";
const apex = "clawdeals.com";
const www = "www.clawdeals.com";
const vercel = "clawdeals-git-main-routing.vercel.app";
const edge = { "x-edge-router-proxy": "marketing", "x-forwarded-host": apex };
let server;
let port;
let output = "";

function request(host, path, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers: { ...headers, host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(10000, () => req.destroy(new Error("Local routing request timed out")));
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  await readFile(".next/BUILD_ID", "utf8");
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      // No production data or credentials: tests stop at routing/unauthenticated guards.
      SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "local-routing-test",
      UPSTASH_REDIS_REST_URL: "http://127.0.0.1:1",
      UPSTASH_REDIS_REST_TOKEN: "local-routing-test",
      CRON_SECRET: "local-routing-test"
    }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Next start failed to become ready: ${output}`)), 20000);
    const onOutput = (chunk) => {
      output = `${output}${chunk}`.slice(-5000);
      if (output.includes("Ready in")) { clearTimeout(timeout); resolve(); }
    };
    server.stdout.on("data", onOutput);
    server.stderr.on("data", onOutput);
    server.once("error", (error) => { clearTimeout(timeout); reject(error); });
    server.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Next start exited ${code}: ${output}`)); });
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
});

const redirects = [
  [app, "/", `https://${app}/start`],
  [app, "/?from=entry", `https://${app}/start?from=entry`],
  [app, "/", `https://${app}/fr/start`, { "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" }],
  [app, "/", `https://${app}/es/start`, { "accept-language": "de-DE,fr;q=0.4,es-MX;q=0.9" }],
  [app, "/", `https://${app}/start`, { cookie: "NEXT_LOCALE=en", "accept-language": "fr" }],
  [app, "/", `https://${app}/es/start`, { cookie: "NEXT_LOCALE=es", "accept-language": "fr" }],
  [app, "/fr", `https://${app}/fr/start`, { cookie: "NEXT_LOCALE=es", "accept-language": "en" }],
  [app, "/es", `https://${app}/es/start`],
  [app, "/en", `https://${app}/start`, { cookie: "NEXT_LOCALE=fr" }],
  [app, "/pricing?ref=entry", `https://${apex}/pricing?ref=entry`],
  [apex, "/start/unknown", `https://${app}/start/unknown`],
  [www, "/start/unknown", `https://${app}/start/unknown`],
  [apex, "/dev/unknown", `https://${app}/dev/unknown`],
  [www, "/settings-other", `https://${apex}/settings-other`],
  [app, "/fr/guides", `https://${apex}/fr/guides`],
  [app, "/pricing", `https://${apex}/pricing`, { "x-forwarded-host": apex, "x-edge-router-proxy": "other" }],
  [www, "/", `https://${apex}/`],
  [www, "/fr/guides?tag=ai", `https://${apex}/fr/guides?tag=ai`],
  [vercel, "/", `https://${apex}/`],
  [vercel, "/fr/guides?tag=ai", `https://${apex}/fr/guides?tag=ai`],
  [vercel, "/en/guides", `https://${apex}/guides`],
  [vercel, "/es/guides", `https://${apex}/es/guides`],
  [vercel, "/start", `https://${app}/start`],
  [vercel, "/start", `https://${app}/start`, edge],
  [vercel, "/api/v1/auth/me", `https://${app}/api/v1/auth/me`],
  ["localhost", "/marketplace", "/browse"],
  ...[apex, www].flatMap((host) => ["/start", "/claim/cd_claim_test", "/device", "/settings/connected-apps", "/my/deals?status=active", "/fr/my/offers", "/pair?token=cd_pair_test", "/keys", "/auth/login", "/developer", "/dev/webmcp", "/console/approvals", "/deals"].map((path) => [host, path, `https://${app}${path}`]))
];

for (const [host, path, location, headers] of redirects) {
  test(`308 ${host}${path} → ${location} ${headers ? JSON.stringify(headers) : ""}`, async () => {
    const response = await request(host, path, headers);
    assert.equal(response.status, 308);
    assert.equal(response.headers.location, location);
  });
}

const served = [
  [apex, "/"],
  ["localhost", "/"],
  ["unknown.example", "/"],
  [app, "/", edge],
  [app, "/fr", edge],
  [app, "/trust-engine", edge],
  [app, "/policy-control", { ...edge, "x-forwarded-host": app }],
  [app, "/", { "x-edge-router-proxy": "1" }],
  [app, "/", { "x-edge-router-proxy": " Marketing " }],
  [app, "/", { "x-forwarded-host": apex }],
  [app, "/pricing", { "x-forwarded-host": "CLAWDEALS.COM:443", "x-edge-router-proxy": " " }],
  [vercel, "/", edge],
  [vercel, "/trust-engine", edge],
  [vercel, "/fr/guides", { "x-forwarded-host": apex }],
  ...["/start", "/device", "/settings/connected-apps", "/my/deals", "/fr/my/threads", "/pair", "/keys", "/auth/login", "/developer"].map((path) => [app, path]),
  ...[app, apex, www, vercel].flatMap((host) => ["/favicon.svg", "/site.webmanifest"].map((path) => [host, path]))
];

for (const [host, path, headers] of served) {
  test(`200 ${host}${path} ${headers ? JSON.stringify(headers) : ""}`, async () => {
    const response = await request(host, path, headers);
    assert.equal(response.status, 200);
    assert.equal(response.headers.location, undefined);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  });
}

test("compiled JS chunks stay same-origin on every host", async () => {
  const html = await request(apex, "/");
  const chunk = html.body.match(/src="([^\"]*\/_next\/static\/[^\"]+\.js)"/)?.[1];
  assert.ok(chunk, "Landing contains a built JS chunk");
  for (const host of [app, apex, www, vercel]) {
    const response = await request(host, chunk);
    assert.equal(response.status, 200, host);
    assert.equal(response.headers.location, undefined, host);
  }
});

test("app robots and sitemap retain their non-indexable behavior", async () => {
  const robots = await request(app, "/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.body, /Disallow: \/(?:\r?\n|$)/);
  assert.equal((await request(app, "/sitemap.xml")).status, 404);
});

test("expiration cron requires authentication on app and marketing hosts", async () => {
  for (const host of [app, apex]) {
    const response = await request(host, "/api/internal/cron/offers-expiration", {}, "POST");
    assert.equal(response.status, 401, host);
    assert.equal(response.headers.location, undefined, host);
    assert.deepEqual(JSON.parse(response.body), { error: "Unauthorized" });
  }
});

test("unknown paths in app sections stay on the app, avoiding Cloudflare redirect loops", async () => {
  for (const path of ["/start/unknown", "/dev/unknown", "/dev"]) {
    const response = await request(app, path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.location, undefined, path);
  }
  assert.equal((await request(apex, "/settings-other")).status, 404);
});

test("existing Worker decisions and the real Next origin terminate without domain loops", async () => {
  // Exercise the existing Worker decision function plus actual origin HTTP responses.
  // No Cloudflare service is contacted and every origin request stays on 127.0.0.1.
  const cases = [
    [`https://${apex}/`, 200],
    [`https://${www}/fr`, 200],
    [`https://${app}/pricing`, 200],
    [`https://${apex}/start/unknown`, 404],
    [`https://${www}/dev/unknown`, 404],
    [`https://${apex}/fr/start/unknown`, 404],
    [`https://${apex}/api/internal/cron/offers-expiration`, 401],
    [`https://${apex}/settings-other`, 404]
  ];
  for (const [source, expectedStatus] of cases) {
    let url = new URL(source);
    const visited = new Set();
    let completed = false;
    for (let hop = 0; hop < 5; hop++) {
      assert.equal(visited.has(url.href), false, `Domain loop from ${source}: ${url.href}`);
      visited.add(url.href);
      const decision = resolveEdgeRouterDecision(url, { MARKETING_ORIGIN: `https://${app}` });
      if (decision.type === "redirect") { url = new URL(decision.location); continue; }
      const target = decision.type === "proxy" ? new URL(decision.target) : url;
      const headers = decision.type === "proxy" ? { ...edge, "x-forwarded-host": url.hostname } : {};
      const response = await request(target.host, `${target.pathname}${target.search}`, headers);
      if (response.headers.location) { url = new URL(response.headers.location, url); continue; }
      assert.equal(response.status, expectedStatus, source);
      completed = true;
      break;
    }
    assert.ok(completed, `Too many redirects from ${source}`);
  }
});

test("Vercel API POST uses a method-preserving 308 to the app", async () => {
  const response = await request(vercel, "/api/internal/cron/offers-expiration?check=1", {}, "POST");
  assert.equal(response.status, 308);
  assert.equal(response.headers.location, `https://${app}/api/internal/cron/offers-expiration?check=1`);
});

test("preview noindex and global security headers remain registered", async () => {
  const response = await request("staging.app.clawdeals.com", "/");
  assert.equal(response.status, 200);
  assert.equal(response.headers["x-robots-tag"], "noindex, follow");
  assert.equal(response.headers["origin-agent-cluster"], "?1");
  assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.ok(response.headers["content-security-policy-report-only"]);
});

test("build registers Proxy only for locale roots, never API/pages/assets", async () => {
  const manifest = JSON.parse(await readFile(".next/server/functions-config-manifest.json", "utf8"));
  const matchers = manifest.functions["/_middleware"]?.matchers;
  assert.ok(matchers?.length, "Next build discovers src/proxy.ts");
  const matches = (path) => matchers.some((matcher) => new RegExp(matcher.regexp).test(path));
  for (const path of ["/", "/en", "/fr", "/es"]) assert.ok(matches(path), path);
  for (const path of ["/start", "/en/start", "/fr/my/offers", "/pricing", "/api/v1/auth/me", "/api/internal/cron/offers-expiration", "/favicon.svg", "/_next/static/chunk.js"]) {
    assert.equal(matches(path), false, path);
  }
});
