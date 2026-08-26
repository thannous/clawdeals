import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import bcrypt from "bcryptjs";

import {
  extractSupabaseRef,
  PRODUCTION_SUPABASE_REF
} from "./assert-non-prod-target.mjs";

export const PUBLIC_SANDBOX_URL = "https://sandbox.clawdeals.com";
export const JUDGE_OWNER_ID = "94000000-0000-4000-8000-000000000001";
export const JUDGE_AGENT_ID = "93000000-0000-4000-8000-000000000001";
export const TARGET_LISTING_ID = "90000000-0000-4000-8000-000000000001";
export const TARGET_THREAD_ID = "91000000-0000-4000-8000-000000000001";
export const DEFAULT_SECRETS_FILE = ".env.webmcp-judge.local";

const API_KEY_NAMESPACE = "cd_sandbox";
const API_KEY_PREFIX_BYTES = 6;
const API_KEY_SECRET_BYTES = 32;
const API_KEY_BCRYPT_ROUNDS = 10;
const RESET_TIMEOUT_MS = 15_000;
const EXPECTED_COUNTS = Object.freeze({
  deals: 3,
  listings: 7,
  watchlists: 3,
  threads: 1,
  messages: 1
});

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

function assertExactSandboxOrigin(value, label) {
  const parsed = parseAbsoluteUrl(value, label);
  if (parsed.origin !== PUBLIC_SANDBOX_URL || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label} must equal ${PUBLIC_SANDBOX_URL}`);
  }
  return parsed.origin;
}

function resolveSecretsPath(value, cwd) {
  const root = path.resolve(cwd);
  const target = path.resolve(root, normalizeString(value) || DEFAULT_SECRETS_FILE);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Secrets file must be a file inside the repository working directory");
  }

  const base = path.basename(target);
  if (!base.startsWith(".env.") || base === ".env.example") {
    throw new Error("Secrets file must use a gitignored .env.* filename");
  }
  return target;
}

function assertMatchingSupabaseBranch(env) {
  const serverUrl = normalizeString(env.SUPABASE_URL);
  const publicUrl = normalizeString(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!serverUrl || !publicUrl) {
    throw new Error("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL are required");
  }

  const serverParsed = parseAbsoluteUrl(serverUrl, "SUPABASE_URL");
  const publicParsed = parseAbsoluteUrl(publicUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const serverRef = extractSupabaseRef(serverUrl);
  const publicRef = extractSupabaseRef(publicUrl);
  if (!serverRef || !publicRef) {
    throw new Error("Public sandbox bootstrap requires branch-specific *.supabase.co URLs");
  }
  for (const [label, parsed, ref] of [
    ["SUPABASE_URL", serverParsed, serverRef],
    ["NEXT_PUBLIC_SUPABASE_URL", publicParsed, publicRef]
  ]) {
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== `${ref}.supabase.co` ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(`${label} must be the exact HTTPS project origin for its Supabase branch ref`);
    }
  }
  if (serverRef !== publicRef) {
    throw new Error("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must target the same branch ref");
  }
  if (serverParsed.origin !== publicParsed.origin) {
    throw new Error("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must use the same project origin");
  }
  if (serverRef === PRODUCTION_SUPABASE_REF) {
    throw new Error(`Production Supabase ref ${PRODUCTION_SUPABASE_REF} is forbidden`);
  }

  return { serverUrl, publicUrl, branchRef: serverRef };
}

export function redactBootstrapSecrets(value, extraSecrets = []) {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  text = typeof text === "string" ? text : String(value ?? "");
  text = text
    .replace(/\bcd_(?:live|sandbox)_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._\-+=/]{12,}\b/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]");

  for (const extra of extraSecrets) {
    const secret = normalizeString(extra);
    if (secret.length >= 8) {
      text = text.split(secret).join("[REDACTED]");
    }
  }
  return text;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{ apply?: boolean, secretsFile?: string, cwd?: string }} [options]
 */
export function resolveBootstrapConfig(
  env = process.env,
  { apply = false, secretsFile = DEFAULT_SECRETS_FILE, cwd = process.cwd() } = {}
) {
  if (normalizeString(env.CLAWDEALS_ENV) !== "sandbox") {
    throw new Error("CLAWDEALS_ENV must equal sandbox");
  }
  if (normalizeString(env.API_KEY_NAMESPACE) !== API_KEY_NAMESPACE) {
    throw new Error(`API_KEY_NAMESPACE must equal ${API_KEY_NAMESPACE}`);
  }
  if (normalizeString(env.NEXT_PUBLIC_WEBMCP_ENABLED) !== "1") {
    throw new Error("NEXT_PUBLIC_WEBMCP_ENABLED must equal 1");
  }
  if (normalizeString(env.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS)) {
    throw new Error("AUTH_ALLOW_LEGACY_IDENTITY_HEADERS must remain unset for the public sandbox");
  }
  if (normalizeString(env.WEBMCP_JUDGE_AGENT_ID) !== JUDGE_AGENT_ID) {
    throw new Error(`WEBMCP_JUDGE_AGENT_ID must equal ${JUDGE_AGENT_ID}`);
  }

  const sandboxUrl = assertExactSandboxOrigin(env.PUBLIC_SANDBOX_URL, "PUBLIC_SANDBOX_URL");
  assertExactSandboxOrigin(env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL");
  assertExactSandboxOrigin(env.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL");
  const supabase = assertMatchingSupabaseBranch(env);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY);
  if (apply && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required with --apply");
  }
  const serviceRoleRef = normalizeString(env.SUPABASE_SERVICE_ROLE_PROJECT_REF);
  if (apply && serviceRoleRef !== supabase.branchRef) {
    throw new Error("SUPABASE_SERVICE_ROLE_PROJECT_REF must equal the isolated Supabase branch ref with --apply");
  }

  return {
    apply: Boolean(apply),
    sandboxUrl,
    supabaseUrl: supabase.serverUrl,
    supabaseRef: supabase.branchRef,
    serviceRoleKey,
    serviceRoleRef,
    secretsPath: resolveSecretsPath(secretsFile, cwd),
    judgeOwnerId: JUDGE_OWNER_ID,
    judgeAgentId: JUDGE_AGENT_ID
  };
}

export async function generateSandboxApiKey({ randomBytes = crypto.randomBytes, hash = bcrypt.hash } = {}) {
  const prefix = randomBytes(API_KEY_PREFIX_BYTES).toString("base64url");
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString("base64url");
  const apiKey = `${API_KEY_NAMESPACE}_${prefix}.${secret}`;
  const keyHash = await hash(secret, API_KEY_BCRYPT_ROUNDS);
  return { apiKey, prefix, keyHash };
}

function throwSupabaseError(label, error) {
  if (!error) return;
  const message = normalizeString(error.message) || "unknown Supabase error";
  throw new Error(`${label} failed: ${message}`);
}

export function createSupabaseBootstrapStore(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("A Supabase service-role client is required");
  }

  return {
    async upsertJudge({ ownerId, agentId, nowIso, agedCreatedAt }) {
      const ownerResult = await client.from("owners").upsert(
        {
          owner_id: ownerId,
          display_name: "WebMCP Submission Judge",
          email: "webmcp-judge@sandbox.clawdeals.invalid",
          email_verified_at: nowIso,
          updated_at: nowIso
        },
        { onConflict: "owner_id" }
      );
      throwSupabaseError("Judge owner upsert", ownerResult.error);

      const agentResult = await client.from("agents").upsert(
        {
          id: agentId,
          owner_id: ownerId,
          name: "WebMCP Submission Judge",
          status: "active",
          metadata: { system: "sandbox.webmcp-judge", env: "sandbox", synthetic: true },
          trust_score: 70,
          trust_flags: [],
          created_at: agedCreatedAt,
          trust_updated_at: nowIso,
          updated_at: nowIso
        },
        { onConflict: "id" }
      );
      throwSupabaseError("Judge agent upsert", agentResult.error);
    },

    async rotateApiKey({ agentId, prefix, keyHash, nowIso }) {
      const revokeResult = await client
        .from("api_keys")
        .update({
          key_state: "REVOKED",
          revoked_at: nowIso,
          grace_expires_at: null
        })
        .eq("agent_id", agentId)
        .in("key_state", ["ACTIVE", "GRACE"]);
      throwSupabaseError("Existing API key revocation", revokeResult.error);

      const insertResult = await client.from("api_keys").insert({
        agent_id: agentId,
        key_prefix: prefix,
        key_hash: keyHash,
        key_state: "ACTIVE",
        scope: "full"
      });
      throwSupabaseError("Sandbox API key insert", insertResult.error);
    },

    async revokeApiKeyByPrefix({ prefix, nowIso }) {
      const result = await client
        .from("api_keys")
        .update({
          key_state: "REVOKED",
          revoked_at: nowIso,
          grace_expires_at: null
        })
        .eq("key_prefix", prefix)
        .eq("key_state", "ACTIVE");
      throwSupabaseError("Bootstrap API key rollback", result.error);
    }
  };
}

async function readJsonResponse(response) {
  const text = typeof response?.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Sandbox reset returned invalid JSON (status ${response?.status ?? "unknown"})`);
  }
}

/**
 * @typedef {{ status?: number, redirected?: boolean, text?: () => Promise<string> }} FetchResponseLike
 * @typedef {(url: string, init?: RequestInit) => Promise<FetchResponseLike>} FetchLike
 */

/**
 * @param {{ fetchImpl?: FetchLike, sandboxUrl: string, apiKey: string }} input
 */
export async function requestJudgeReset({ fetchImpl = fetch, sandboxUrl, apiKey }) {
  if (assertExactSandboxOrigin(sandboxUrl, "PUBLIC_SANDBOX_URL") !== PUBLIC_SANDBOX_URL) {
    throw new Error("Unexpected sandbox origin");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESET_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${PUBLIC_SANDBOX_URL}/api/v1/sandbox/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mode: "webmcp_challenge" }),
      redirect: "manual",
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);
    if (response?.status !== 200 || response?.redirected) {
      const code = normalizeString(payload?.error?.code || payload?.code);
      throw new Error(`Sandbox judge reset failed with status ${response?.status ?? "unknown"}${code ? ` (${code})` : ""}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export function validateJudgeReset(payload) {
  if (!payload || payload.ok !== true) {
    throw new Error("Sandbox judge reset must return ok=true");
  }
  for (const [name, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (payload?.counts?.[name] !== expected) {
      throw new Error(`Sandbox judge reset count ${name} must equal ${expected}`);
    }
  }

  const buyerAgentId = normalizeString(payload?.actors?.buyer_agent_id);
  const sellerAgentId = normalizeString(payload?.actors?.seller_agent_id);
  const sellerOwnerId = normalizeString(payload?.actors?.seller_owner_id);
  if (buyerAgentId !== JUDGE_AGENT_ID) {
    throw new Error("Sandbox judge reset returned an unexpected buyer agent");
  }
  if (!sellerAgentId || sellerAgentId === JUDGE_AGENT_ID || !sellerOwnerId) {
    throw new Error("Sandbox judge reset returned invalid synthetic seller actors");
  }
  if (normalizeString(payload?.thread?.thread_id) !== TARGET_THREAD_ID) {
    throw new Error(`Sandbox judge reset must return stable thread ${TARGET_THREAD_ID}`);
  }
  if (normalizeString(payload?.thread?.listing_id) !== TARGET_LISTING_ID) {
    throw new Error(`Sandbox judge reset must return target listing ${TARGET_LISTING_ID}`);
  }
  const listingIds = Array.isArray(payload.listings)
    ? payload.listings.map((item) => normalizeString(item?.listing_id))
    : [];
  if (listingIds.length !== EXPECTED_COUNTS.listings || new Set(listingIds).size !== EXPECTED_COUNTS.listings) {
    throw new Error(`Sandbox judge reset must return ${EXPECTED_COUNTS.listings} unique listing IDs`);
  }
  if (!listingIds.includes(TARGET_LISTING_ID)) {
    throw new Error(`Sandbox judge reset listings must include ${TARGET_LISTING_ID}`);
  }

  return {
    sellerAgentId,
    sellerOwnerId,
    listingIds: listingIds.slice().sort(),
    threadId: TARGET_THREAD_ID
  };
}

export function validateStableJudgeResets(first, second) {
  const a = validateJudgeReset(first);
  const b = validateJudgeReset(second);
  if (a.sellerAgentId !== b.sellerAgentId || a.sellerOwnerId !== b.sellerOwnerId) {
    throw new Error("Sandbox judge reset changed synthetic seller actors");
  }
  if (JSON.stringify(a.listingIds) !== JSON.stringify(b.listingIds) || a.threadId !== b.threadId) {
    throw new Error("Sandbox judge reset changed deterministic listing or thread IDs");
  }
  return b;
}

export function createSecretFileStore(fsImpl = fs) {
  return {
    async reserve(filePath) {
      return fsImpl.open(filePath, "wx", 0o600);
    },
    async commit(handle, content) {
      await handle.writeFile(content, { encoding: "utf8" });
      await handle.chmod(0o600);
      await handle.sync();
      await handle.close();
    },
    async cleanup(handle, filePath) {
      try {
        await handle?.close();
      } catch {
        // Best-effort close; preserve the original bootstrap error.
      }
      try {
        await fsImpl.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  };
}

function buildSecretsFile({ config, buyerApiKey, sellerApiKey, sellerAgentId, sellerOwnerId }) {
  return [
    "# Synthetic WebMCP public sandbox actors only. Never commit this file.",
    `PUBLIC_SANDBOX_URL=${config.sandboxUrl}`,
    `PUBLIC_SANDBOX_JUDGE_KEY=${buyerApiKey}`,
    `PUBLIC_SANDBOX_SELLER_KEY=${sellerApiKey}`,
    `WEBMCP_JUDGE_AGENT_ID=${config.judgeAgentId}`,
    `WEBMCP_JUDGE_OWNER_ID=${config.judgeOwnerId}`,
    `WEBMCP_SELLER_AGENT_ID=${sellerAgentId}`,
    `WEBMCP_SELLER_OWNER_ID=${sellerOwnerId}`,
    ""
  ].join("\n");
}

/**
 * @param {ReturnType<typeof resolveBootstrapConfig>} config
 * @param {{
 *   store?: {
 *     upsertJudge: (input: any) => Promise<any>,
 *     rotateApiKey: (input: any) => Promise<any>,
 *     revokeApiKeyByPrefix: (input: any) => Promise<any>
 *   },
 *   fetchImpl?: FetchLike,
 *   keyFactory?: () => Promise<{ apiKey: string, prefix: string, keyHash: string }>,
 *   secretFiles?: {
 *     reserve: (filePath: string) => Promise<any>,
 *     commit: (handle: any, content: string) => Promise<any>,
 *     cleanup: (handle: any, filePath: string) => Promise<any>
 *   },
 *   now?: Date
 * }} [dependencies]
 */
export async function applyPublicSandboxBootstrap(
  config,
  {
    store,
    fetchImpl = fetch,
    keyFactory = generateSandboxApiKey,
    secretFiles = createSecretFileStore(),
    now = new Date()
  } = {}
) {
  if (!config?.apply) {
    throw new Error("applyPublicSandboxBootstrap requires an --apply configuration");
  }
  if (!store) {
    throw new Error("A service-role bootstrap store is required");
  }

  let handle;
  const issuedPrefixes = [];
  const nowIso = now.toISOString();
  const agedCreatedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  try {
    handle = await secretFiles.reserve(config.secretsPath);

    const buyerKey = await keyFactory();
    await store.upsertJudge({
      ownerId: config.judgeOwnerId,
      agentId: config.judgeAgentId,
      nowIso,
      agedCreatedAt
    });
    await store.rotateApiKey({
      agentId: config.judgeAgentId,
      prefix: buyerKey.prefix,
      keyHash: buyerKey.keyHash,
      nowIso
    });
    issuedPrefixes.push(buyerKey.prefix);

    const firstReset = await requestJudgeReset({
      fetchImpl,
      sandboxUrl: config.sandboxUrl,
      apiKey: buyerKey.apiKey
    });
    const first = validateJudgeReset(firstReset);

    const sellerKey = await keyFactory();
    await store.rotateApiKey({
      agentId: first.sellerAgentId,
      prefix: sellerKey.prefix,
      keyHash: sellerKey.keyHash,
      nowIso
    });
    issuedPrefixes.push(sellerKey.prefix);

    const secondReset = await requestJudgeReset({
      fetchImpl,
      sandboxUrl: config.sandboxUrl,
      apiKey: buyerKey.apiKey
    });
    const stable = validateStableJudgeResets(firstReset, secondReset);

    await secretFiles.commit(
      handle,
      buildSecretsFile({
        config,
        buyerApiKey: buyerKey.apiKey,
        sellerApiKey: sellerKey.apiKey,
        sellerAgentId: stable.sellerAgentId,
        sellerOwnerId: stable.sellerOwnerId
      })
    );
    handle = null;

    return {
      ok: true,
      proof_layer: "PUBLIC_SANDBOX_BOOTSTRAP",
      sandbox_url: config.sandboxUrl,
      supabase_ref: config.supabaseRef,
      judge_agent_id: config.judgeAgentId,
      seller_agent_id: stable.sellerAgentId,
      target_listing_id: TARGET_LISTING_ID,
      target_thread_id: TARGET_THREAD_ID,
      reset_count: 2,
      secrets_file: config.secretsPath
    };
  } catch (error) {
    for (const prefix of issuedPrefixes.reverse()) {
      try {
        await store.revokeApiKeyByPrefix({ prefix, nowIso });
      } catch {
        // Best-effort rollback; preserve the first failure.
      }
    }
    if (handle) {
      try {
        await secretFiles.cleanup(handle, config.secretsPath);
      } catch {
        // Preserve the first failure; the reserved file contains no committed secrets.
      }
    }
    throw error;
  }
}

export const _internal = {
  EXPECTED_COUNTS,
  assertExactSandboxOrigin,
  resolveSecretsPath
};
