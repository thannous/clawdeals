const DEFAULT_SANDBOX_URL = "https://sandbox.clawdeals.com";
const DEFAULT_PRODUCTION_URL = "https://clawdeals.com";
const CHALLENGE_PATH = "/webmcp-challenge";
const RESET_PATH = "/api/v1/sandbox/reset";
const ORIGIN_AGENT_CLUSTER = "?1";
const REQUEST_TIMEOUT_MS = 15_000;
const APPROVED_SANDBOX_HOST = new URL(DEFAULT_SANDBOX_URL).hostname;

const FORBIDDEN_SANDBOX_HOSTS = new Set([
  "clawdeals.com",
  "www.clawdeals.com",
  "app.clawdeals.com",
  "staging.app.clawdeals.com"
]);

const PRODUCTION_RESET_HOSTS = new Set(["clawdeals.com", "www.clawdeals.com", "app.clawdeals.com"]);

const AUTHENTICATED_TOOL_NAMES = [
  "get_page_context",
  "show_listings",
  "open_listing",
  "search_listings",
  "create_buy_mission",
  "start_thread",
  "send_message",
  "make_offer",
  "respond_to_offer",
  "request_contact_reveal",
  "get_action_receipt"
];

const SECRET_PATTERNS = [
  /\bcd_(?:live|sandbox)_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+=\/]{12,}\b/gi
];

/**
 * @typedef {object} FetchResponseLike
 * @property {number} status
 * @property {boolean} [redirected]
 * @property {Headers | Record<string, string | string[] | undefined>} [headers]
 * @property {() => Promise<string>} [text]
 */

/** @typedef {(url: string, init?: RequestInit) => Promise<FetchResponseLike>} FetchLike */

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAbsoluteUrl(value, label) {
  const input = normalizeString(value);
  if (!input) {
    throw new Error(`${label} is required`);
  }
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }
  return parsed;
}

export function redactSecrets(value, extraValues = []) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  let text = typeof serialized === "string" ? serialized : String(value ?? "");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  for (const extra of extraValues) {
    const secret = normalizeString(extra);
    if (secret.length < 8) continue;
    text = text.split(secret).join("[REDACTED]");
  }
  return text;
}

export function assertSandboxUrl(value) {
  const parsed = parseAbsoluteUrl(value, "PUBLIC_SANDBOX_URL");
  if (parsed.protocol !== "https:") {
    throw new Error("PUBLIC_SANDBOX_URL must use HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  if (FORBIDDEN_SANDBOX_HOSTS.has(host)) {
    throw new Error(`PUBLIC_SANDBOX_URL must not target production host ${host}`);
  }
  if (host.endsWith(".vercel.app")) {
    throw new Error("PUBLIC_SANDBOX_URL must not use a default *.vercel.app domain");
  }
  if (host !== APPROVED_SANDBOX_HOST) {
    throw new Error(`PUBLIC_SANDBOX_URL must target approved sandbox host ${APPROVED_SANDBOX_HOST}`);
  }
  return parsed.origin;
}

export function assertProductionUrl(value) {
  const parsed = parseAbsoluteUrl(value, "PUBLIC_PRODUCTION_URL");
  if (parsed.protocol !== "https:") {
    throw new Error("PUBLIC_PRODUCTION_URL must use HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  if (!PRODUCTION_RESET_HOSTS.has(host)) {
    throw new Error(`PUBLIC_PRODUCTION_URL must be a known production host, received ${host}`);
  }
  return parsed.origin;
}

/**
 * @param {{ status?: number, body?: Record<string, unknown> | null, authenticated?: boolean }} [options]
 */
export function classifySandboxResetGet({ status, body, authenticated = false } = {}) {
  if (status === 404) {
    return {
      ok: false,
      code: "PRODUCTION_LIKE_404",
      detail: "Sandbox reset GET returned 404; that is production behavior"
    };
  }

  if (!authenticated && (status === 401 || status === 403)) {
    return {
      ok: true,
      code: "UNAUTHORIZED",
      detail: "Sandbox reset GET reported unauthorized without a key"
    };
  }

  if (status === 200 && body && typeof body === "object" && body.enabled === true) {
    if (body.authorized === true) {
      return authenticated
        ? {
            ok: true,
            code: "AUTHORIZED",
            detail: "Sandbox reset GET authorized the supplied judge key"
          }
        : {
            ok: false,
            code: "UNEXPECTED_AUTHORIZATION",
            detail: "Sandbox reset GET authorized a caller without a judge key"
          };
    }
    if (body.authorized === false) {
      return {
        ok: true,
        code: authenticated ? "NOT_AUTHORIZED" : "SANDBOX_UNAUTHORIZED",
        detail: authenticated
          ? "Sandbox reset GET did not authorize the supplied judge key"
          : "Sandbox reset GET reported sandbox behavior without authorization"
      };
    }
  }

  return {
    ok: false,
    code: "UNEXPECTED_RESET_GET",
    detail: `Sandbox reset GET returned unexpected status ${status}`
  };
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return String(headers.get(name) || "");
  }
  const needle = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === needle) {
      return Array.isArray(value) ? String(value[0] || "") : String(value || "");
    }
  }
  return "";
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function assertGetOnly(method) {
  const normalized = String(method || "GET").toUpperCase();
  if (normalized !== "GET" && normalized !== "HEAD") {
    throw new Error("Public sandbox verifier is GET-only and will not send mutations");
  }
  return normalized;
}

function assertSafeRequest(url, method) {
  const normalized = assertGetOnly(method);
  const parsed = new URL(String(url));
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  if (PRODUCTION_RESET_HOSTS.has(host) && path !== RESET_PATH) {
    throw new Error("Production GET is limited to /api/v1/sandbox/reset");
  }
  return { method: normalized, url: parsed };
}

/** @param {FetchResponseLike} response */
async function readBody(response) {
  const contentType = headerValue(response.headers, "content-type").toLowerCase();
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return { text: "", json: null };
  if (contentType.includes("application/json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      return { text, json: null };
    }
  }
  return { text, json: null };
}

/**
 * @param {FetchLike} fetchImpl
 * @param {string} url
 * @param {{ headers?: Record<string, string>, timeoutMs?: number }} [options]
 */
async function get(fetchImpl, url, { headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  assertSafeRequest(url, "GET");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal
    });
    const body = await readBody(response);
    return {
      url,
      status: response.status,
      redirected: Boolean(response.redirected) || isRedirectStatus(response.status),
      location: headerValue(response.headers, "location"),
      originAgentCluster: headerValue(response.headers, "origin-agent-cluster"),
      body: body.json,
      text: body.text
    };
  } finally {
    clearTimeout(timer);
  }
}

function check(name, ok, detail) {
  return { name, status: ok ? "PASS" : "FAIL", detail };
}

/** @param {Record<string, string | undefined>} [env] */
export function resolvePublicSandboxOptions(env = process.env) {
  const sandboxUrl = assertSandboxUrl(env.PUBLIC_SANDBOX_URL || DEFAULT_SANDBOX_URL);
  const productionUrl = assertProductionUrl(env.PUBLIC_PRODUCTION_URL || DEFAULT_PRODUCTION_URL);
  const judgeKey = normalizeString(env.PUBLIC_SANDBOX_JUDGE_KEY);
  return {
    sandboxUrl,
    productionUrl,
    judgeKey: judgeKey || null,
    timeoutMs: Number(env.PUBLIC_SANDBOX_TIMEOUT_MS) > 0 ? Number(env.PUBLIC_SANDBOX_TIMEOUT_MS) : REQUEST_TIMEOUT_MS
  };
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: FetchLike,
 *   now?: () => string
 * }} [options]
 */
export async function verifyPublicSandbox({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is required");
  }

  const options = resolvePublicSandboxOptions(env);
  const secrets = options.judgeKey ? [options.judgeKey] : [];
  const checks = [];
  const requests = [];

  const challengeUrl = `${options.sandboxUrl}${CHALLENGE_PATH}`;
  const sandboxResetUrl = `${options.sandboxUrl}${RESET_PATH}`;
  const productionResetUrl = `${options.productionUrl}${RESET_PATH}`;

  const challenge = await get(fetchImpl, challengeUrl, { timeoutMs: options.timeoutMs });
  requests.push({ method: "GET", url: challengeUrl, status: challenge.status });
  checks.push(
    check(
      "sandbox_challenge_http_200",
      challenge.status === 200 && !challenge.redirected,
      challenge.redirected
        ? `Challenge redirected to ${challenge.location || "another URL"}`
        : `Challenge returned HTTP ${challenge.status}`
    )
  );
  checks.push(
    check(
      "sandbox_origin_agent_cluster",
      challenge.originAgentCluster === ORIGIN_AGENT_CLUSTER,
      `Origin-Agent-Cluster=${challenge.originAgentCluster || "missing"}`
    )
  );

  const productionReset = await get(fetchImpl, productionResetUrl, { timeoutMs: options.timeoutMs });
  requests.push({ method: "GET", url: productionResetUrl, status: productionReset.status });
  checks.push(
    check(
      "production_reset_404",
      productionReset.status === 404,
      `Production reset GET returned HTTP ${productionReset.status}`
    )
  );

  const sandboxReset = await get(fetchImpl, sandboxResetUrl, { timeoutMs: options.timeoutMs });
  requests.push({ method: "GET", url: sandboxResetUrl, status: sandboxReset.status });
  const anonymousReset = classifySandboxResetGet({
    status: sandboxReset.status,
    body: sandboxReset.body,
    authenticated: false
  });
  checks.push(check("sandbox_reset_get_non_production", anonymousReset.ok, anonymousReset.detail));

  let authenticated = "SKIPPED";
  if (options.judgeKey) {
    const authorizedReset = await get(fetchImpl, sandboxResetUrl, {
      timeoutMs: options.timeoutMs,
      headers: { Authorization: `Bearer ${options.judgeKey}` }
    });
    requests.push({ method: "GET", url: sandboxResetUrl, status: authorizedReset.status, authenticated: true });
    const classified = classifySandboxResetGet({
      status: authorizedReset.status,
      body: authorizedReset.body,
      authenticated: true
    });
    const ok = classified.ok && classified.code === "AUTHORIZED";
    authenticated = ok ? "PASS" : "FAIL";
    checks.push(check("sandbox_reset_get_judge_key", ok, classified.detail));
  }

  const failed = checks.filter((item) => item.status === "FAIL");
  const report = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    proof_layer: "PUBLIC_SANDBOX",
    generated_at: now(),
    sandbox_url: options.sandboxUrl,
    production_url: options.productionUrl,
    challenge_url: challengeUrl,
    mutations: "NONE",
    methods: ["GET"],
    authenticated,
    expected_authenticated_tools: AUTHENTICATED_TOOL_NAMES,
    checks,
    requests
  };

  return JSON.parse(redactSecrets(report, secrets));
}

export const PUBLIC_SANDBOX_DEFAULTS = {
  DEFAULT_SANDBOX_URL,
  DEFAULT_PRODUCTION_URL,
  CHALLENGE_PATH,
  RESET_PATH,
  ORIGIN_AGENT_CLUSTER,
  AUTHENTICATED_TOOL_NAMES,
  FORBIDDEN_SANDBOX_HOSTS
};
