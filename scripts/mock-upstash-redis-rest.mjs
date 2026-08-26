import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4413;
const DEFAULT_TOKEN = "clawdeals-e2e-upstash-token";
const MAX_BODY_BYTES = 1_000_000;

function base64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function encodeResult(value) {
  if (typeof value === "string") return value === "OK" ? value : base64(value);
  if (Array.isArray(value)) return value.map(encodeResult);
  return value;
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionIndex(command, name) {
  return command.findIndex((value, index) => index >= 3 && String(value).toLowerCase() === name);
}

function compareStreamIds(left, right) {
  const [leftMs, leftSequence] = String(left).split("-").map(Number);
  const [rightMs, rightSequence] = String(right).split("-").map(Number);
  if (leftMs !== rightMs) return leftMs - rightMs;
  return leftSequence - rightSequence;
}

function streamIdMatchesBound(id, bound, direction) {
  const rawBound = String(bound);
  if (rawBound === "-") return direction === "lower";
  if (rawBound === "+") return direction === "upper";

  const exclusive = rawBound.startsWith("(");
  const compared = compareStreamIds(id, exclusive ? rawBound.slice(1) : rawBound);
  if (direction === "lower") return exclusive ? compared > 0 : compared >= 0;
  return exclusive ? compared < 0 : compared <= 0;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

export function createMockUpstashRedisServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  token = DEFAULT_TOKEN
} = {}) {
  if (host !== DEFAULT_HOST && host !== "localhost") {
    throw new Error("The Upstash test mock may only bind to loopback.");
  }
  if (!token) throw new Error("A synthetic Upstash test token is required.");

  const values = new Map();
  const tokenBuckets = new Map();
  const streams = new Map();
  let streamSequence = 0;

  function purgeExpired(key, now = Date.now()) {
    const entry = values.get(key);
    if (entry?.expiresAt && entry.expiresAt <= now) values.delete(key);
    const bucket = tokenBuckets.get(key);
    if (bucket?.expiresAt && bucket.expiresAt <= now) tokenBuckets.delete(key);
    const stream = streams.get(key);
    if (stream?.expiresAt && stream.expiresAt <= now) streams.delete(key);
  }

  function exists(key) {
    purgeExpired(key);
    return values.has(key) || tokenBuckets.has(key) || streams.has(key);
  }

  function expiryFromSet(command, now) {
    const pxIndex = optionIndex(command, "px");
    const exIndex = optionIndex(command, "ex");
    const pxatIndex = optionIndex(command, "pxat");
    const exatIndex = optionIndex(command, "exat");
    if (pxIndex >= 0) return now + (parsePositiveNumber(command[pxIndex + 1]) || 0);
    if (exIndex >= 0) return now + (parsePositiveNumber(command[exIndex + 1]) || 0) * 1000;
    if (pxatIndex >= 0) return parsePositiveNumber(command[pxatIndex + 1]);
    if (exatIndex >= 0) return (parsePositiveNumber(command[exatIndex + 1]) || 0) * 1000;
    return null;
  }

  function executeTokenBucket(command) {
    const script = String(command[1] || "");
    if (
      !script.includes('HMGET", key, "tokens", "ts"') ||
      !script.includes('HMSET", key, "tokens", tokens, "ts", ts') ||
      !script.includes('PEXPIRE", key, ttl_ms')
    ) {
      throw new Error("mock EVAL only supports the ClawDeals token-bucket script");
    }
    const keyCount = Number(command[2]);
    if (keyCount !== 1) throw new Error("mock EVAL supports one token-bucket key");
    const key = String(command[3]);
    const capacity = Number(command[4]);
    const refillRate = Number(command[5]);
    const nowMs = Number(command[6]);
    const ttlMs = Number(command[7]);
    if (![capacity, refillRate, nowMs, ttlMs].every(Number.isFinite)) {
      throw new Error("invalid token-bucket EVAL arguments");
    }

    purgeExpired(key, nowMs);
    const previous = tokenBuckets.get(key);
    let tokens = previous?.tokens ?? capacity;
    const previousTimestamp = previous?.timestamp ?? nowMs;
    tokens = Math.min(capacity, tokens + Math.max(0, nowMs - previousTimestamp) * refillRate);
    const allowed = tokens >= 1 ? 1 : 0;
    if (allowed) tokens -= 1;
    tokenBuckets.set(key, {
      tokens,
      timestamp: nowMs,
      expiresAt: nowMs + Math.max(1, ttlMs)
    });
    return [allowed, tokens, nowMs];
  }

  function executeXadd(command) {
    const key = String(command[1]);
    const starIndex = command.findIndex((value, index) => index >= 2 && value === "*");
    if (starIndex < 0) throw new Error("mock XADD requires an auto-generated id");
    const fields = {};
    for (let index = starIndex + 1; index + 1 < command.length; index += 2) {
      fields[String(command[index])] = command[index + 1];
    }
    const now = Date.now();
    const id = `${now}-${streamSequence++}`;
    const entry = streams.get(key) || { rows: [], expiresAt: null };
    entry.rows.push({ id, fields });
    const maxlenIndex = command.findIndex((value) => String(value).toLowerCase() === "maxlen");
    if (maxlenIndex >= 0) {
      const thresholdIndex = command[maxlenIndex + 1] === "~" ? maxlenIndex + 2 : maxlenIndex + 1;
      const threshold = Number(command[thresholdIndex]);
      if (Number.isFinite(threshold) && threshold > 0 && entry.rows.length > threshold) {
        entry.rows.splice(0, entry.rows.length - threshold);
      }
    }
    streams.set(key, entry);
    return id;
  }

  function executeXrange(command, reverse = false) {
    const key = String(command[1]);
    purgeExpired(key);
    const entry = streams.get(key);
    if (!entry) return [];

    const start = reverse ? command[3] : command[2];
    const end = reverse ? command[2] : command[3];
    const countIndex = command.findIndex((value, index) => index >= 4 && String(value).toLowerCase() === "count");
    const count = countIndex >= 0 ? Number(command[countIndex + 1]) : Number.POSITIVE_INFINITY;

    const rows = entry.rows
      .filter(
        (row) =>
          streamIdMatchesBound(row.id, start, "lower") &&
          streamIdMatchesBound(row.id, end, "upper")
      )
      .sort((left, right) => compareStreamIds(left.id, right.id));

    if (reverse) rows.reverse();

    return rows.slice(0, Number.isFinite(count) && count >= 0 ? count : 0).map((row) => [
      row.id,
      Object.entries(row.fields).flatMap(([field, value]) => [field, value])
    ]);
  }

  function execute(command) {
    if (!Array.isArray(command) || command.length === 0) throw new Error("invalid Redis command");
    const name = String(command[0]).toLowerCase();
    const now = Date.now();

    if (name === "ping") return "PONG";
    if (name === "flushdb") {
      values.clear();
      tokenBuckets.clear();
      streams.clear();
      return "OK";
    }
    if (name === "get") {
      const key = String(command[1]);
      purgeExpired(key, now);
      return values.get(key)?.value ?? null;
    }
    if (name === "set") {
      const key = String(command[1]);
      const alreadyExists = exists(key);
      if (optionIndex(command, "nx") >= 0 && alreadyExists) return null;
      if (optionIndex(command, "xx") >= 0 && !alreadyExists) return null;
      const keepTtl = optionIndex(command, "keepttl") >= 0;
      const previousExpiry = keepTtl ? values.get(key)?.expiresAt ?? null : null;
      values.set(key, {
        value: command[2],
        expiresAt: expiryFromSet(command, now) ?? previousExpiry
      });
      tokenBuckets.delete(key);
      streams.delete(key);
      return "OK";
    }
    if (name === "del") {
      let deleted = 0;
      for (const rawKey of command.slice(1)) {
        const key = String(rawKey);
        purgeExpired(key, now);
        const didDelete = values.delete(key) || tokenBuckets.delete(key) || streams.delete(key);
        if (didDelete) deleted += 1;
      }
      return deleted;
    }
    if (name === "expire" || name === "pexpire") {
      const key = String(command[1]);
      if (!exists(key)) return 0;
      const duration = Number(command[2]) * (name === "expire" ? 1000 : 1);
      const entry = values.get(key) || tokenBuckets.get(key) || streams.get(key);
      entry.expiresAt = now + Math.max(1, duration);
      return 1;
    }
    if (name === "eval") return executeTokenBucket(command);
    if (name === "xadd") return executeXadd(command);
    if (name === "xrange") return executeXrange(command);
    if (name === "xrevrange") return executeXrange(command, true);

    throw new Error(`unsupported Redis command in test mock: ${name}`);
  }

  function commandResponse(command) {
    try {
      return { result: encodeResult(execute(command)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "clawdeals-upstash-test-mock" }));
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }

    try {
      const body = await readJsonBody(request);
      const result = request.url === "/pipeline" || request.url === "/multi-exec"
        ? body.map(commandResponse)
        : commandResponse(body);
      response.writeHead(200, {
        "Content-Type": "application/json",
        "upstash-sync-token": "clawdeals-e2e"
      });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("mock server address unavailable");
      return { host, port: address.port, url: `http://${host}:${address.port}`, token };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const mock = createMockUpstashRedisServer({
    host: process.env.E2E_UPSTASH_REDIS_HOST || DEFAULT_HOST,
    port: Number(process.env.E2E_UPSTASH_REDIS_PORT || DEFAULT_PORT),
    token: process.env.E2E_UPSTASH_REDIS_TOKEN || DEFAULT_TOKEN
  });
  const address = await mock.listen();
  console.log(`[upstash-test-mock] listening on ${address.url}`);
  const shutdown = async () => {
    await mock.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
