import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import edgeRouterWorker from "../../../workers/edge-router";

const REMOTE_URL = new URL("https://clawdeals.com/api/mcp");

type Identity = {
  agentId: string;
  installationId: string;
  scopes: string[];
};

function workerEnv(overrides: Record<string, string> = {}) {
  return {
    APP_ORIGIN: "https://app.test",
    MARKETING_ORIGIN: "https://marketing.test",
    MARKETING_HOST: "clawdeals.com",
    REMOTE_MCP_ENABLED: "true",
    MCP_CANARY_INSTALLATION_IDS: "installation-a,installation-b",
    MCP_ALLOWED_HOSTS: "clawdeals.com",
    ...overrides
  };
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request ? input : new Request(input, init);
}

function createUpstreamMock(identities: Record<string, Identity>) {
  const businessCalls: Array<{ authorization: string | null; path: string; requestId: string | null }> = [];

  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = requestFrom(input, init);
    const url = new URL(request.url);
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "") || "";

    if (url.pathname === "/api/v1/agents/me") {
      const identity = identities[token];
      if (!identity) {
        return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(
        JSON.stringify({
          data: {
            agent_id: identity.agentId,
            installation_id: identity.installationId,
            oauth_scopes: identity.scopes
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.pathname === "/api/v1/deals") {
      businessCalls.push({
        authorization,
        path: `${url.pathname}${url.search}`,
        requestId: request.headers.get("x-request-id")
      });
      const items = url.searchParams.get("q") === "oversized"
        ? Array.from({ length: 25 }, (_, index) => ({ index, description: "x".repeat(900) }))
        : [{ token }];
      return new Response(JSON.stringify({ items, next_cursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    throw new Error(`Unexpected upstream request: ${request.method} ${request.url}`);
  });

  return { spy, businessCalls };
}

function createClient(token: string, env = workerEnv()) {
  const transport = new StreamableHTTPClientTransport(REMOTE_URL, {
    authProvider: { token: async () => token },
    fetch: async (input, init) => {
      const request = requestFrom(input, init);
      const headers = new Headers(request.headers);
      headers.set("host", new URL(request.url).host);
      return edgeRouterWorker.fetch(new Request(request, { headers }), env);
    }
  });
  const client = new Client({ name: "clawdeals-http-worker-test", version: "1.0.0" });
  return { client, transport };
}

describe("remote MCP Cloudflare canary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed before protocol handling when the canary or OAuth bearer is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} });

    const disabled = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: {
          "content-length": String(64 * 1024 + 1),
          "content-type": "application/json"
        },
        body
      }),
      workerEnv({ REMOTE_MCP_ENABLED: "false", MCP_CANARY_INSTALLATION_IDS: "" })
    );
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toMatchObject({ error: { code: "MCP_CANARY_DISABLED" } });

    const missing = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      }),
      workerEnv()
    );
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("invalid_token");

    const legacyApiKey = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: {
          authorization: "Bearer cd_live_legacy",
          "content-type": "application/json"
        },
        body
      }),
      workerEnv()
    );
    expect(legacyApiKey.status).toBe(401);
    expect(await legacyApiKey.json()).toMatchObject({ error: { code: "OAUTH_ACCESS_TOKEN_REQUIRED" } });

    const tooLarge = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: {
          authorization: "Bearer cd_at_reader_a",
          "content-length": String(64 * 1024 + 1),
          "content-type": "application/json"
        },
        body: "x".repeat(64 * 1024 + 1)
      }),
      workerEnv()
    );
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });

    const preflight = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "OPTIONS",
        headers: { origin: "https://app.clawdeals.com" }
      }),
      workerEnv()
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.clawdeals.com");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops reading a chunked request as soon as the payload limit is crossed", async () => {
    const token = "cd_at_reader_a";
    const { businessCalls } = createUpstreamMock({
      [token]: {
        agentId: "agent-a",
        installationId: "installation-a",
        scopes: ["deals:read"]
      }
    });
    let emittedChunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emittedChunks += 1;
        if (emittedChunks > 100) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(20 * 1024));
      }
    });

    const response = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body,
        duplex: "half"
      } as RequestInit & { duplex: "half" }),
      workerEnv()
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
    expect(emittedChunks).toBeLessThan(100);
    expect(businessCalls).toHaveLength(0);
  });

  it("rejects unenrolled identities, unsupported scopes, and untrusted origins", async () => {
    createUpstreamMock({
      cd_at_unenrolled: {
        agentId: "agent-x",
        installationId: "installation-x",
        scopes: ["deals:read"]
      },
      cd_at_write_only: {
        agentId: "agent-a",
        installationId: "installation-a",
        scopes: ["deals:write"]
      }
    });
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} });

    const unenrolled = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: { authorization: "Bearer cd_at_unenrolled", "content-type": "application/json" },
        body
      }),
      workerEnv()
    );
    expect(unenrolled.status).toBe(403);
    expect(await unenrolled.json()).toMatchObject({ error: { code: "MCP_CANARY_FORBIDDEN" } });

    const unsupportedScope = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: { authorization: "Bearer cd_at_write_only", "content-type": "application/json" },
        body
      }),
      workerEnv()
    );
    expect(unsupportedScope.status).toBe(403);
    expect(unsupportedScope.headers.get("www-authenticate")).toContain("insufficient_scope");

    const untrustedOrigin = await edgeRouterWorker.fetch(
      new Request(REMOTE_URL, {
        method: "POST",
        headers: {
          authorization: "Bearer cd_at_write_only",
          "content-type": "application/json",
          origin: "https://evil.example"
        },
        body
      }),
      workerEnv()
    );
    expect(untrustedOrigin.status).toBe(403);
    expect(await untrustedOrigin.json()).toMatchObject({ error: { code: "ORIGIN_NOT_ALLOWED" } });
  });

  it("serves a scope-filtered read-only catalog and forwards the caller token", async () => {
    const token = "cd_at_reader_a";
    const { businessCalls } = createUpstreamMock({
      [token]: {
        agentId: "agent-a",
        installationId: "installation-a",
        scopes: ["deals:read"]
      }
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { client, transport } = createClient(token);
    await client.connect(transport);

    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "clawdeals.deals.get",
        "clawdeals.deals.list"
      ]);
      expect(listed.tools.some((tool) => tool.name === "clawdeals.connect.setup")).toBe(false);
      expect(listed.tools.some((tool) => tool.name === "clawdeals.deals.create")).toBe(false);
      expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

      const result = await client.callTool({
        name: "clawdeals.deals.list",
        arguments: { limit: 1 }
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: true });
      expect(JSON.stringify(result.structuredContent)).not.toContain(token);
      expect(JSON.stringify(result.structuredContent)).toContain("[REDACTED]");
      expect(businessCalls).toHaveLength(1);
      expect(businessCalls[0]).toMatchObject({
        authorization: `Bearer ${token}`,
        path: "/api/v1/deals?limit=1"
      });
      expect(businessCalls[0].requestId).toBeTruthy();

      for (const [message] of logSpy.mock.calls) {
        expect(String(message)).not.toContain(token);
      }
    } finally {
      await client.close();
    }
  }, 30000);

  it("exposes exactly the seven canary read tools when all read scopes are granted", async () => {
    const token = "cd_at_all_reads";
    createUpstreamMock({
      [token]: {
        agentId: "agent-a",
        installationId: "installation-a",
        scopes: ["deals:read", "watchlists:read", "listings:read"]
      }
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { client, transport } = createClient(token);
    await client.connect(transport);

    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "clawdeals.deals.get",
        "clawdeals.deals.list",
        "clawdeals.listings.get",
        "clawdeals.listings.list",
        "clawdeals.watchlists.get",
        "clawdeals.watchlists.get_matches",
        "clawdeals.watchlists.list"
      ]);
      expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    } finally {
      await client.close();
    }
  }, 30000);

  it("keeps the final serialized tool response within the remote output limit", async () => {
    const token = "cd_at_reader_a";
    createUpstreamMock({
      [token]: {
        agentId: "agent-a",
        installationId: "installation-a",
        scopes: ["deals:read"]
      }
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { client, transport } = createClient(token);
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: "clawdeals.deals.list",
        arguments: { q: "oversized", limit: 25 }
      });
      const text = result.content.find((entry) => entry.type === "text")?.text || "";
      expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(16 * 1024);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: { code: "OUTPUT_TOO_LARGE" },
        meta: { output_truncated: true }
      });
    } finally {
      await client.close();
    }
  }, 30000);

  it("keeps concurrent OAuth principals isolated per request", async () => {
    const tokenA = "cd_at_reader_a";
    const tokenB = "cd_at_reader_b";
    const { businessCalls } = createUpstreamMock({
      [tokenA]: {
        agentId: "agent-a",
        installationId: "installation-a",
        scopes: ["deals:read"]
      },
      [tokenB]: {
        agentId: "agent-b",
        installationId: "installation-b",
        scopes: ["deals:read"]
      }
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const a = createClient(tokenA);
    const b = createClient(tokenB);
    await Promise.all([a.client.connect(a.transport), b.client.connect(b.transport)]);

    try {
      const [resultA, resultB] = await Promise.all([
        a.client.callTool({ name: "clawdeals.deals.list", arguments: { q: "a" } }),
        b.client.callTool({ name: "clawdeals.deals.list", arguments: { q: "b" } })
      ]);
      expect(resultA.structuredContent).toMatchObject({ ok: true });
      expect(resultB.structuredContent).toMatchObject({ ok: true });
      expect(businessCalls).toHaveLength(2);
      expect(businessCalls.find((call) => call.path.includes("q=a"))?.authorization).toBe(`Bearer ${tokenA}`);
      expect(businessCalls.find((call) => call.path.includes("q=b"))?.authorization).toBe(`Bearer ${tokenB}`);
    } finally {
      await Promise.all([a.client.close(), b.client.close()]);
    }
  }, 30000);

  it("keeps the marketing MCP page and www canonical redirect outside the remote handler", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("marketing", { status: 200 }));

    const marketing = await edgeRouterWorker.fetch(
      new Request("https://clawdeals.com/mcp"),
      workerEnv()
    );
    expect(marketing.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockClear();
    const canonical = await edgeRouterWorker.fetch(
      new Request("https://www.clawdeals.com/api/mcp"),
      workerEnv()
    );
    expect(canonical.status).toBe(308);
    expect(canonical.headers.get("location")).toBe("https://clawdeals.com/api/mcp");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
