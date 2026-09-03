#!/usr/bin/env node
/**
 * Post-deploy check: every `/_next/static/*` asset referenced by the key public
 * pages must answer 200 through the public host. Catches HTML <-> chunk skew and
 * transient origin errors right after a Vercel/Cloudflare deployment.
 *
 * Usage:
 *   node scripts/verify-static-chunks.mjs [--base https://clawdeals.com] [--pages /,/webmcp-challenge,/browse]
 *                                         [--repeat 1] [--interval-ms 15000]
 *
 * Exit code 1 when any referenced asset is not 200 in any round.
 */

const args = process.argv.slice(2);
function readArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

const base = String(readArg("base", process.env.STATIC_CHUNKS_BASE_URL || "https://clawdeals.com")).replace(/\/$/, "");
const pages = String(readArg("pages", "/,/webmcp-challenge,/browse,/marketplace")).split(",").map((p) => p.trim()).filter(Boolean);
const repeat = Math.max(1, Number(readArg("repeat", 1)) || 1);
const intervalMs = Math.max(0, Number(readArg("interval-ms", 15_000)) || 0);

const ASSET_RE = /(?:src|href)="((?:https?:\/\/[^"]+)?\/_next\/static\/[^"]+\.(?:js|css))"/g;

async function fetchWithStatus(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "manual", headers: { "cache-control": "no-cache" } });
    return { url, status: response.status, cfCache: response.headers.get("cf-cache-status"), ms: Date.now() - started };
  } catch (error) {
    return { url, status: 0, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
  }
}

async function collectAssets(pagePath) {
  const pageUrl = `${base}${pagePath}`;
  const response = await fetch(pageUrl, { headers: { accept: "text/html", "cache-control": "no-cache" } });
  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(ASSET_RE)) {
    const ref = match[1];
    assets.add(ref.startsWith("http") ? ref : `${base}${ref}`);
  }
  return { pageUrl, pageStatus: response.status, assets: [...assets] };
}

let failures = 0;
for (let round = 1; round <= repeat; round += 1) {
  if (round > 1 && intervalMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const roundReport = [];
  for (const pagePath of pages) {
    const { pageUrl, pageStatus, assets } = await collectAssets(pagePath);
    if (pageStatus !== 200) {
      failures += 1;
      roundReport.push({ page: pageUrl, status: pageStatus, assets: 0, failed: ["<page>"] });
      continue;
    }
    const results = await Promise.all(assets.map(fetchWithStatus));
    const failed = results.filter((result) => result.status !== 200);
    failures += failed.length;
    roundReport.push({
      page: pageUrl,
      status: pageStatus,
      assets: assets.length,
      failed: failed.map((result) => `${result.status} ${result.url.replace(base, "")}${result.error ? ` (${result.error})` : ""}`)
    });
  }
  console.log(JSON.stringify({ round, at: new Date().toISOString(), base, report: roundReport }, null, 2));
}

if (failures > 0) {
  console.error(`[static-chunks] FAIL: ${failures} asset request(s) did not return 200 on ${base}`);
  process.exit(1);
}
console.log(`[static-chunks] PASS: all referenced build assets answered 200 on ${base} (${repeat} round${repeat > 1 ? "s" : ""})`);
