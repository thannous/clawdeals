function resolveFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("Global fetch is not available in this runtime.");
}

export function createUpstashRedis({ url, token, fetcher } = {}) {
  if (!url || !token) {
    throw new Error("Upstash Redis url/token missing.");
  }
  const request = fetcher || resolveFetch();

  async function command(commandName, ...args) {
    const response = await request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([commandName, ...args]),
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Upstash response was not valid JSON: ${text}`);
    }

    if (!response.ok) {
      const detail = payload?.error || response.statusText;
      throw new Error(`Upstash Redis error: ${detail}`);
    }

    if (payload?.error) {
      throw new Error(`Upstash Redis error: ${payload.error}`);
    }

    return payload?.result;
  }

  async function evalScript(script, keys = [], args = []) {
    const numKeys = String(keys.length);
    return command("EVAL", script, numKeys, ...keys, ...args);
  }

  return {
    command,
    eval: evalScript,
  };
}

export function resolveUpstashConfig(env) {
  const processEnv =
    typeof process !== "undefined" && process?.env ? process.env : undefined;
  const source = env || processEnv || {};
  const url = source.UPSTASH_REDIS_REST_URL;
  const token = source.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}
