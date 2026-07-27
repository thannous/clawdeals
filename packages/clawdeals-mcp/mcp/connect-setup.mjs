import crypto from "node:crypto";

import { z } from "zod";

import { buildClawdealsNpxServerConfig } from "./install-lib.mjs";
import {
  DEFAULT_API_BASE,
  installIntoTargets,
  resolveInstallTargets
} from "./install.mjs";

const DEFAULT_ORIGIN = "mcp";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_AGENT_NAME = "ClawDeals MCP Agent";
const DEFAULT_SCOPES = ["agent:read", "agent:write"];
const DEFAULT_CLIENT_VERSION = "0.2.3";

export const ClientTypeSchema = z.enum([
  "cursor",
  "claude-desktop",
  "claude-code",
  "codex",
  "windsurf",
  "gemini",
  "other"
]);

export const ConnectSetupInputSchema = z.discriminatedUnion("step", [
  z
    .object({
      step: z.literal("initiate"),
      agent_name: z.string().min(1).max(80).optional(),
      client_type: ClientTypeSchema.optional(),
      client_version: z.string().min(1).max(40).optional()
    })
    .strict(),
  z
    .object({
      step: z.literal("poll"),
      session_id: z.string().uuid(),
      poll_token: z.string().min(1)
    })
    .strict(),
  z
    .object({
      step: z.literal("finalize"),
      session_id: z.string().uuid(),
      poll_token: z.string().min(1),
      client_type: ClientTypeSchema.optional(),
      client_version: z.string().min(1).max(40).optional(),
      client: ClientTypeSchema.optional(),
      dry_run: z.boolean().optional()
    })
    .strict()
]);

function normalizeBaseUrl(baseUrl) {
  const raw = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!raw) return DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_TIMEOUT_MS;
}

function parseRetryAfterSeconds(value) {
  if (!value) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function safeJsonParse(text) {
  if (!text) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function codeFromStatus(status) {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 410) return "EXPIRED";
  if (status === 429) return "RATE_LIMITED";
  return "ERROR";
}

function zodValidationMessage(error) {
  const message = error?.issues?.[0]?.message || "Invalid input";
  return `Input validation error: ${message}`;
}

function stableSuccess({ requestId, data }) {
  return {
    ok: true,
    data,
    meta: { request_id: requestId || crypto.randomUUID() }
  };
}

function stableError({ requestId, code, message, details = {}, retryAfterSeconds = null }) {
  return {
    ok: false,
    error: {
      code: code || "ERROR",
      message: message || "Request failed",
      details: details && typeof details === "object" ? details : {}
    },
    meta: {
      request_id: requestId || crypto.randomUUID(),
      ...(typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds)
        ? { retry_after_seconds: retryAfterSeconds }
        : {})
    }
  };
}

function stableErrorFromApi({ requestId, apiResult }) {
  return stableError({
    requestId,
    code: apiResult?.error?.code || "ERROR",
    message: apiResult?.error?.message || "Request failed",
    details: apiResult?.error?.details || {},
    retryAfterSeconds: apiResult?.retryAfterSeconds || null
  });
}

async function callSetupApi({
  requestId,
  env,
  fetchImpl,
  method,
  path,
  body,
  authToken,
  idempotencyKey,
  extraHeaders = {}
}) {
  const baseUrl = normalizeBaseUrl(env?.CLAWDEALS_API_BASE);
  const origin = String(env?.CLAWDEALS_ORIGIN || DEFAULT_ORIGIN).trim() || DEFAULT_ORIGIN;
  const timeoutMs = normalizeTimeoutMs(env?.CLAWDEALS_TIMEOUT_MS);
  const url = `${baseUrl}${path}`;

  const headers = {
    accept: "application/json",
    "x-clawdeals-origin": origin,
    "x-request-id": requestId,
    ...extraHeaders
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  if (idempotencyKey) headers["idempotency-key"] = String(idempotencyKey);
  const shouldSendBody = body !== undefined;
  if (shouldSendBody) headers["content-type"] = "application/json; charset=utf-8";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body: shouldSendBody ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    const text = await response.text();
    const parsed = safeJsonParse(text);

    if (!parsed.ok) {
      return {
        ok: false,
        status: response.status,
        retryAfterSeconds,
        error: {
          code: codeFromStatus(response.status),
          message: "Non-JSON response from server",
          details: {}
        }
      };
    }

    if (response.status < 400) {
      return {
        ok: true,
        status: response.status,
        retryAfterSeconds,
        data: parsed.value?.data ?? parsed.value
      };
    }

    const serverError = parsed.value?.error;
    if (serverError && typeof serverError === "object") {
      return {
        ok: false,
        status: response.status,
        retryAfterSeconds,
        error: {
          code: serverError.code || codeFromStatus(response.status),
          message: serverError.message || response.statusText || "Request failed",
          details: serverError.details && typeof serverError.details === "object" ? serverError.details : {}
        }
      };
    }

    return {
      ok: false,
      status: response.status,
      retryAfterSeconds,
      error: {
        code: codeFromStatus(response.status),
        message: response.statusText || "Request failed",
        details: {}
      }
    };
  } catch (error) {
    clearTimeout(timeout);
    const isAbort = error && typeof error === "object" && error.name === "AbortError";
    return {
      ok: false,
      status: isAbort ? 408 : 0,
      retryAfterSeconds: null,
      error: {
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort ? "Request timed out" : "Network error",
        details: {}
      }
    };
  }
}

function resolveClientTarget(client) {
  const normalized = String(client || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "other") {
    throw new Error("client=other is not supported for local config installation");
  }
  return normalized;
}

function selectInstallTarget({ client }) {
  const normalizedClient = resolveClientTarget(client);
  const targets = resolveInstallTargets({ client: normalizedClient || undefined });
  if (!targets.length) return [];
  if (normalizedClient) return targets.slice(0, 1);
  return targets.slice(0, 1);
}

async function verifyNewKey({ requestId, env, fetchImpl, apiKey }) {
  const verifyResult = await callSetupApi({
    requestId,
    env,
    fetchImpl,
    method: "GET",
    path: "/v1/agents/me",
    authToken: apiKey
  });

  if (!verifyResult.ok) {
    return {
      ok: false,
      error: {
        code: verifyResult.error.code || "VERIFY_FAILED",
        message: verifyResult.error.message || "Verification failed"
      }
    };
  }

  return {
    ok: true,
    agent_id: verifyResult.data?.agent_id || null
  };
}

export async function executeConnectSetup(input, options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  let parsed;
  try {
    parsed = ConnectSetupInputSchema.parse(input || {});
  } catch (error) {
    return stableError({
      requestId,
      code: "VALIDATION_ERROR",
      message: zodValidationMessage(error),
      details: {}
    });
  }

  if (parsed.step === "initiate") {
    const initiateResult = await callSetupApi({
      requestId,
      env,
      fetchImpl,
      method: "POST",
      path: "/v1/connect/sessions",
      idempotencyKey: crypto.randomUUID(),
      body: {
        requested_agent_name: parsed.agent_name || DEFAULT_AGENT_NAME,
        requested_scopes: DEFAULT_SCOPES
      },
      extraHeaders: {
        "x-client-type": parsed.client_type || "other",
        "x-client-version": parsed.client_version || DEFAULT_CLIENT_VERSION
      }
    });

    if (!initiateResult.ok) {
      return stableErrorFromApi({ requestId, apiResult: initiateResult });
    }

    return stableSuccess({
      requestId,
      data: {
        session_id: initiateResult.data?.session_id || null,
        status: initiateResult.data?.status || null,
        claim_url: initiateResult.data?.claim_url || null,
        verification_code: initiateResult.data?.verification_code || null,
        poll_token: initiateResult.data?.poll_token || null,
        expires_at: initiateResult.data?.expires_at || null,
        interval_seconds: initiateResult.data?.interval_seconds || 2
      }
    });
  }

  if (parsed.step === "poll") {
    const pollResult = await callSetupApi({
      requestId,
      env,
      fetchImpl,
      method: "GET",
      path: `/v1/connect/sessions/${encodeURIComponent(parsed.session_id)}`,
      authToken: parsed.poll_token
    });

    if (!pollResult.ok && pollResult.status === 429) {
      return stableSuccess({
        requestId,
        data: {
          session_id: parsed.session_id,
          status: "PENDING_CLAIM",
          claimed_at: null,
          expires_at: null,
          retry_after_seconds: pollResult.retryAfterSeconds || 2
        }
      });
    }

    if (!pollResult.ok) {
      return stableErrorFromApi({ requestId, apiResult: pollResult });
    }

    return stableSuccess({
      requestId,
      data: {
        session_id: pollResult.data?.session_id || parsed.session_id,
        status: pollResult.data?.status || null,
        claimed_at: pollResult.data?.claimed_at ?? null,
        expires_at: pollResult.data?.expires_at ?? null,
        retry_after_seconds: pollResult.retryAfterSeconds || null
      }
    });
  }

  const exchangeResult = await callSetupApi({
    requestId,
    env,
    fetchImpl,
    method: "POST",
    path: `/v1/connect/sessions/${encodeURIComponent(parsed.session_id)}/exchange`,
    authToken: parsed.poll_token,
    idempotencyKey: crypto.randomUUID(),
    body: {
      requested_key_scope: "agent_write",
      installation: {
        client_type: parsed.client_type || parsed.client || "other",
        client_version: parsed.client_version || DEFAULT_CLIENT_VERSION
      }
    }
  });

  if (!exchangeResult.ok) {
    return stableErrorFromApi({ requestId, apiResult: exchangeResult });
  }

  const apiKey = String(exchangeResult.data?.api_key || "").trim();
  if (!apiKey) {
    return stableError({
      requestId,
      code: "ERROR",
      message: "Exchange succeeded but no API key was returned",
      details: {}
    });
  }

  let targets;
  try {
    targets = selectInstallTarget({ client: parsed.client });
  } catch (error) {
    return stableError({
      requestId,
      code: "VALIDATION_ERROR",
      message: String(error?.message || error),
      details: {}
    });
  }

  if (!targets.length) {
    return stableError({
      requestId,
      code: "INSTALL_FAILED",
      message: "No supported MCP config file found. Pass client to finalize setup.",
      details: {}
    });
  }

  const baseUrl = normalizeBaseUrl(env?.CLAWDEALS_API_BASE);
  const origin = String(env?.CLAWDEALS_ORIGIN || DEFAULT_ORIGIN).trim() || DEFAULT_ORIGIN;
  const timeoutMs = String(normalizeTimeoutMs(env?.CLAWDEALS_TIMEOUT_MS));
  const serverConfig = buildClawdealsNpxServerConfig({
    apiKey,
    apiBase: baseUrl,
    origin,
    timeoutMs
  });

  const installResults = installIntoTargets({
    targets,
    serverName: "clawdeals",
    serverConfig,
    dryRun: parsed.dry_run === true,
    logger: { log() {}, error() {} }
  });
  const installResult = installResults[0] || null;

  if (!installResult?.ok) {
    return stableError({
      requestId,
      code: "INSTALL_FAILED",
      message: `Failed to write MCP config (${installResult?.reason || "unknown"})`,
      details: { config_path: installResult?.filePath || null }
    });
  }

  const verified = await verifyNewKey({
    requestId,
    env,
    fetchImpl,
    apiKey
  });

  return stableSuccess({
    requestId,
    data: {
      session_id: exchangeResult.data?.session_id || parsed.session_id,
      status: exchangeResult.data?.status || null,
      agent_id: exchangeResult.data?.agent_id || null,
      installation_id: exchangeResult.data?.installation_id || null,
      api_key_id: exchangeResult.data?.api_key_id || null,
      config_path: installResult.filePath,
      backup_path: installResult.backupPath || null,
      client_type: targets[0]?.kind || parsed.client || "auto",
      wrote: Boolean(installResult.wrote),
      verified
    }
  });
}

export function registerConnectSetupTool(server) {
  server.registerTool(
    "clawdeals.connect.setup",
    {
      description:
        "Agent-initiated setup flow (initiate -> poll -> finalize) to install ClawDeals MCP without manual API key copy/paste.",
      inputSchema: ConnectSetupInputSchema
    },
    async (args) => {
      const stable = await executeConnectSetup(args || {}, {
        requestId: crypto.randomUUID(),
        env: process.env,
        fetchImpl: fetch
      });
      const text = JSON.stringify(stable);
      return {
        structuredContent: stable,
        content: [{ type: "text", text }],
        isError: !stable.ok
      };
    }
  );
}
