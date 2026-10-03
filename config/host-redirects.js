// Static host routing belongs in Next's redirect manifest, not a Proxy on every request.
function normalizeHost(host) {
  return String(host).trim().toLowerCase().split(":")[0];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostPattern(hosts) {
  return `(?:${hosts.map(escapeRegex).join("|")})`;
}

function ignoreCase(pattern) {
  return pattern.replace(/[a-z]/g, (letter) => `[${letter}${letter.toUpperCase()}]`);
}

function hostRedirects(env = process.env) {
  const appHost = normalizeHost(env.APP_HOST || "app.clawdeals.com");
  const appHosts = [...new Set([appHost, "app.clawdeals.com"])].filter((host) => host !== "localhost");
  const marketingHosts = String(env.MARKETING_HOSTS || "clawdeals.com,www.clawdeals.com")
    .split(",").map(normalizeHost).filter(Boolean);
  const marketingHost = marketingHosts.includes("clawdeals.com") ? "clawdeals.com"
    : marketingHosts.includes("www.clawdeals.com") ? "www.clawdeals.com" : marketingHosts[0];
  const knownMarketingHosts = [...new Set([...marketingHosts, "clawdeals.com", "www.clawdeals.com"])];
  // App host wins even when accidentally included in MARKETING_HOSTS.
  const redirectMarketingHosts = knownMarketingHosts.filter((host) => !appHosts.includes(host) && host !== "localhost");
  const vercelHost = `(?!(?:${[...appHosts, ...knownMarketingHosts].map(escapeRegex).join("|")})$).+\\.vercel\\.app`;
  const locale = "(?:(?:fr|en|es)/)?";
  const staticPath = `${locale}(?:_next/|favicon[.]ico$|favicon[.]svg$|site[.]webmanifest$)`;
  // Keep all Worker app sections on the app, including their 404 descendants:
  // sending /start/unknown back to marketing would loop through Cloudflare.
  const appPages = "(?:developer|(?:start|settings|dev|deals|my|pair|keys|claim|device|auth|console)(?:/|$))";
  const appSection = `${locale}(?:${appPages}|api(?:/|$))`;
  // APIs on the marketing host stay same-origin.
  const marketingAppSection = `${locale}${appPages}`;
  const marker = { type: "header", key: "x-edge-router-proxy", value: "\\s*(?:[mM][aA][rR][kK][eE][tT][iI][nN][gG]|1)\\s*" };
  const forwardedMarketing = { type: "header", key: "x-forwarded-host", value: `\\s*${ignoreCase(hostPattern(knownMarketingHosts))}(?::[^:]*)?\\s*` };
  // Preserve both current Worker markers and the legacy forwarded-host-only exemption.
  const directRequestConditions = [
    { missing: [marker, forwardedMarketing] },
    { missing: [marker], has: [{ type: "header", key: "x-edge-router-proxy", value: ".*\\S.*" }] }
  ];
  const rules = [];
  function add(source, host, destination, conditions = {}) {
    const rule = { destination, permanent: true, locale: false,
      ...conditions, has: [{ type: "host", value: host }, ...(conditions.has || [])] };
    // Pages i18n inserts /en for matching even on unprefixed URLs. Strip it from
    // the canonical English destination, while preserving explicit /fr and /es.
    rules.push({ ...rule, source: source === "/" ? "/en" : `/en${source}` });
    rules.push({ ...rule, source });
  }

  add(`/:path(${appSection}.*)`, vercelHost, `https://${appHost}/:path`);
  for (const conditions of directRequestConditions) {
    for (const source of ["/", `/:path((?!${staticPath}|${appSection}).+)`]) {
      add(source, vercelHost, `https://${marketingHost || appHost}${source === "/" ? "/" : "/:path"}`, conditions);
    }
    if (marketingHost) {
      // Roots need cookie/Accept-Language selection; robots/sitemap stay on the app.
      add(`/:path((?!${staticPath}|${appSection}|${locale}(?:robots[.]txt|sitemap[.]xml)$|(?:fr|en|es)$).+)`,
        hostPattern(appHosts), `https://${marketingHost}/:path`, conditions);
    }
  }
  add(`/:path(${marketingAppSection}.*)`, hostPattern(redirectMarketingHosts), `https://${appHost}/:path`);
  const aliases = redirectMarketingHosts.filter((host) => host !== marketingHost);
  if (marketingHost && aliases.length) {
    add("/", hostPattern(aliases), `https://${marketingHost}/`);
    add(`/:path((?!${staticPath}).+)`, hostPattern(aliases), `https://${marketingHost}/:path`);
  }
  return rules;
}

module.exports = { hostRedirects };
