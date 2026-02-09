import crypto from "node:crypto";

const DEFAULT_API_BASE = "http://localhost:3000/api";

export function uuid() {
  return crypto.randomUUID();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeApiBase(value) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

export function redactSecret(value) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return "<empty>";
  if (raw.length <= 12) return "<redacted>";
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function resolveTimeoutMs(env, { key = "TI265_TIMEOUT_MS", fallback = 15000 } = {}) {
  return toPositiveInt(env?.[key], fallback);
}

export async function requestJson(
  method,
  path,
  {
    apiBase,
    apiKey,
    ownerId,
    idempotencyKey,
    requestId,
    headers: extraHeaders,
    body,
    timeoutMs = 15000,
    fetchImpl = fetch
  } = {}
) {
  const base = normalizeApiBase(apiBase);
  const resolvedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${resolvedPath}`);

  const headers = {
    accept: "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    ...(ownerId ? { "x-owner-id": ownerId } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
    ...(requestId ? { "x-request-id": String(requestId) } : {}),
    ...(extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
  const shouldSendBody = isWrite && body !== undefined;

  try {
    const res = await fetchImpl(url.toString(), {
      method,
      headers: {
        ...headers,
        ...(shouldSendBody ? { "content-type": "application/json; charset=utf-8" } : {})
      },
      body: shouldSendBody ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeout);

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (error) {
      const message = `Non-JSON response (${res.status}) from ${method} ${resolvedPath}`;
      const err = new Error(message);
      err.status = res.status;
      err.body = text;
      throw err;
    }

    if (res.status < 400) {
      return json;
    }

    const serverError = json?.error;
    const err = new Error(serverError?.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.code = serverError?.code || "ERROR";
    err.details = serverError?.details || {};
    err.body = json;
    throw err;
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      const err = new Error(`Request timed out after ${timeoutMs}ms: ${method} ${resolvedPath}`);
      err.code = "TIMEOUT";
      throw err;
    }
    throw error;
  }
}

export async function registerAgent({ apiBase, ownerId, name, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  const res = await requestJson("POST", "/v1/agents", {
    apiBase,
    ownerId,
    idempotencyKey,
    timeoutMs,
    body: { name: name || "TI-265 Agent" }
  });

  const agentId = res?.data?.agent_id || null;
  const apiKey = res?.data?.api_key || null;
  if (!agentId || !apiKey) {
    throw new Error("Failed to register agent: missing data.agent_id or data.api_key");
  }

  return { agentId, apiKey };
}

export async function resetSandbox({ apiBase, apiKey, timeoutMs } = {}) {
  return await requestJson("POST", "/v1/sandbox/reset", {
    apiBase,
    apiKey,
    timeoutMs,
    body: {}
  });
}

export async function upsertPolicy({ apiBase, ownerId, policy, timeoutMs } = {}) {
  if (!ownerId) {
    throw new Error("ownerId is required to upsert policy");
  }

  return await requestJson("PUT", "/v1/policies", {
    apiBase,
    ownerId,
    timeoutMs,
    body: policy
  });
}

export async function createWatchlist({ apiBase, apiKey, name, criteria, active = true, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", "/v1/watchlists", {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: { name: name || null, criteria, active }
  });
}

export async function createDeal({ apiBase, apiKey, deal, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", "/v1/deals", {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: deal
  });
}

export async function voteDeal({ apiBase, apiKey, dealId, direction, reason, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", `/v1/deals/${encodeURIComponent(dealId)}/vote`, {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: { direction, reason }
  });
}

export async function listTrendingDeals({ apiBase, apiKey, limit = 5, timeoutMs } = {}) {
  const qs = new URLSearchParams({ sort: "trend", limit: String(limit) });
  return await requestJson("GET", `/v1/deals?${qs.toString()}`, {
    apiBase,
    apiKey,
    timeoutMs
  });
}

export async function createListing({ apiBase, apiKey, listing, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", "/v1/listings", {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: listing
  });
}

export async function createOffer({ apiBase, apiKey, listingId, offer, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", `/v1/listings/${encodeURIComponent(listingId)}/offers`, {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: offer
  });
}

export async function counterOffer({ apiBase, apiKey, offerId, counter, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", `/v1/offers/${encodeURIComponent(offerId)}/counter`, {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: counter
  });
}

export async function acceptOffer({ apiBase, apiKey, offerId, timeoutMs } = {}) {
  const idempotencyKey = uuid();
  return await requestJson("POST", `/v1/offers/${encodeURIComponent(offerId)}/accept`, {
    apiBase,
    apiKey,
    idempotencyKey,
    timeoutMs,
    body: {}
  });
}

export function parseSseFrame(text) {
  if (!text || typeof text !== "string") return null;
  const lines = text.split("\n").filter((l) => l !== "");
  if (lines.length === 0) return null;

  if (lines[0].startsWith(":")) {
    const comment = lines.map((l) => l.slice(1).trim()).join("\n");
    return { type: "comment", comment };
  }

  const frame = { type: "event", id: null, event: null, data: "" };
  for (const line of lines) {
    if (line.startsWith("id:")) frame.id = line.slice(3).trim();
    if (line.startsWith("event:")) frame.event = line.slice(6).trim();
    if (line.startsWith("data:")) {
      const chunk = line.slice(5).trim();
      frame.data = frame.data ? `${frame.data}\n${chunk}` : chunk;
    }
  }
  return frame;
}

export function extractSseFrames(buffer) {
  const frames = [];
  let rest = typeof buffer === "string" ? buffer : "";

  let idx;
  while ((idx = rest.indexOf("\n\n")) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const frame = parseSseFrame(raw);
    if (frame) frames.push(frame);
  }

  return { frames, rest };
}

const sseStateByResponse = new WeakMap();

export async function openSse(
  {
    apiBase,
    apiKey,
    types = ["watchlist.match"],
    heartbeatSeconds = 1,
    replay = false,
    lastEventId = null,
    headers
  } = {},
  { fetchImpl = fetch } = {}
) {
  const base = normalizeApiBase(apiBase);
  const url = new URL(`${base}/v1/events/stream`);
  url.searchParams.set("heartbeat", String(heartbeatSeconds));
  if (types && types.length > 0) url.searchParams.set("types", types.join(","));
  if (replay) url.searchParams.set("replay", "true");
  if (lastEventId) url.searchParams.set("last_event_id", String(lastEventId));

  const controller = new AbortController();
  const requestHeaders = {
    Accept: "text/event-stream",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(headers && typeof headers === "object" ? headers : {})
  };

  // Disable compression for SSE: Node's fetch sends gzip/br by default and the
  // decompressor can buffer small heartbeats (": ping"), breaking streaming.
  if (!Object.keys(requestHeaders).some((key) => key.toLowerCase() === "accept-encoding")) {
    requestHeaders["Accept-Encoding"] = "identity";
  }

  const res = await fetchImpl(url.toString(), {
    method: "GET",
    headers: requestHeaders,
    signal: controller.signal
  });

  return { res, controller, url: url.toString() };
}

export async function waitForSseEvent(response, { timeoutMs = 15000, predicate } = {}) {
  if (!response?.body || typeof response.body.getReader !== "function") {
    throw new Error("SSE response body is not a readable stream");
  }

  let state = sseStateByResponse.get(response);
  if (!state) {
    state = {
      reader: response.body.getReader(),
      decoder: new TextDecoder(),
      buffer: ""
    };
    sseStateByResponse.set(response, state);
  }

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const extracted = extractSseFrames(state.buffer);
    state.buffer = extracted.rest;

    for (const frame of extracted.frames) {
      if (typeof predicate === "function") {
        if (predicate(frame)) return frame;
        continue;
      }
      return frame;
    }

    const remainingMs = timeoutMs - (Date.now() - start);
    const readPromise = state.reader.read();
    const result = await Promise.race([
      readPromise,
      sleep(Math.max(0, remainingMs)).then(() => ({ __timeout: true }))
    ]);

    if (result?.__timeout) {
      // Prevent unhandled rejections if the read settles after we give up.
      readPromise.catch(() => {});
      break;
    }

    const { value, done } = result;
    if (done) break;
    state.buffer += state.decoder.decode(value, { stream: true });
  }

  throw new Error("Timed out waiting for SSE frame");
}

