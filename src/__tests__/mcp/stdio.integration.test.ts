import http from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type CapturedRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

describe("MCP stdio server (integration)", () => {
  let apiServer: http.Server;
  let apiBase: string;
  const captured: CapturedRequest[] = [];

  beforeAll(async () => {
    apiServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      await new Promise<void>((resolve) => req.on("end", resolve));

      const body = Buffer.concat(chunks).toString("utf8");
      captured.push({
        method: String(req.method || "GET"),
        url: String(req.url || ""),
        headers: req.headers as any,
        body
      });

      res.setHeader("content-type", "application/json; charset=utf-8");

      if (req.method === "GET" && req.url?.startsWith("/api/v1/deals")) {
        res.statusCode = 200;
        res.end(JSON.stringify({ items: [], next_cursor: null }));
        return;
      }

      if (req.method === "POST" && req.url === "/api/v1/connect/sessions") {
        res.statusCode = 201;
        res.end(
          JSON.stringify({
            data: {
              session_id: "11111111-1111-4111-8111-111111111111",
              status: "PENDING_CLAIM",
              claim_url: "https://example.com/claim/cd_claim_test",
              verification_code: "reef-X4B2",
              poll_token: "cd_poll_test",
              expires_at: "2026-02-14T12:00:00.000Z",
              interval_seconds: 2
            }
          })
        );
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/api/v1/connect/sessions/")) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              session_id: "11111111-1111-4111-8111-111111111111",
              status: "PENDING_CLAIM",
              claimed_at: null,
              expires_at: "2026-02-14T12:00:00.000Z"
            }
          })
        );
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/api/v1/connect/sessions/") && req.url.endsWith("/exchange")) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              session_id: "11111111-1111-4111-8111-111111111111",
              status: "DELIVERED",
              agent_id: "agent_test",
              installation_id: "inst_test",
              api_key: "cd_live_test_hidden",
              api_key_id: "key_test",
              issued_at: "2026-02-14T12:00:00.000Z"
            }
          })
        );
        return;
      }

      if (req.method === "GET" && req.url === "/api/v1/agents/me") {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              agent_id: "agent_test",
              name: "Test Agent",
              owner_id: null,
              installation_id: "inst_test",
              oauth_scopes: []
            }
          })
        );
        return;
      }

      if (req.method === "POST" && req.url === "/api/v1/deals") {
        res.statusCode = 201;
        res.end(JSON.stringify({ deal: { deal_id: "deal-1" } }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "not found", details: {} } }));
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: unknown) => {
        apiServer.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        apiServer.off("error", onError);
        resolve();
      };

      apiServer.once("error", onError);
      apiServer.once("listening", onListening);
      apiServer.listen(0, "127.0.0.1");
    });
    const addr = apiServer.address();
    if (!addr || typeof addr === "string") throw new Error("Failed to bind test server");
    apiBase = `http://127.0.0.1:${addr.port}/api`;
  });

  afterAll(async () => {
    if (!apiServer) return;
    if (!apiServer.listening) return;
    await new Promise<void>((resolve, reject) => {
      apiServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    captured.length = 0;
  });

  it("exposes 20 tools and forwards REST calls with origin + idempotency", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: ["scripts/mcp-server.mjs"],
      cwd: process.cwd(),
      stderr: "pipe",
      env: {
        CLAWDEALS_API_KEY: "dummy",
        CLAWDEALS_API_BASE: apiBase,
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      }
    });

    const client = new Client({ name: "mcp-test-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const list = await client.listTools();
      expect(list.tools.length).toBe(20);

      const dealsList = await client.callTool({
        name: "clawdeals.deals.list",
        arguments: {
          tags: ["gpu"],
          status: ["NEW", "ACTIVE"]
        }
      });
      const stableList: any = dealsList.structuredContent;
      expect(stableList.ok).toBe(true);
      expect(stableList.data).toEqual({ items: [], next_cursor: null });

      const invalidInput = await client.callTool({
        name: "clawdeals.deals.list",
        arguments: {
          unknown_field: true
        }
      });
      expect(invalidInput.isError).toBe(true);
      const stableInvalid: any = invalidInput.structuredContent;
      expect(stableInvalid.ok).toBe(false);
      expect(stableInvalid.error.code).toBe("VALIDATION_ERROR");
      expect(stableInvalid.meta.request_id).toBeTruthy();

      const firstReq = captured.find((r) => r.method === "GET" && r.url.startsWith("/api/v1/deals"));
      expect(firstReq).toBeTruthy();
      expect(String(firstReq!.headers["x-clawdeals-origin"])).toBe("mcp");
      expect(String(firstReq!.headers.authorization)).toBe("Bearer dummy");
      expect(String(firstReq!.headers["x-request-id"])).toBe(stableList.meta.request_id);
      expect(firstReq!.url).toContain("tags=gpu");
      expect(firstReq!.url).toContain("status=NEW%2CACTIVE");

      const dealsCreate = await client.callTool({
        name: "clawdeals.deals.create",
        arguments: {
          idempotency_key: "idem-1",
          title: "Test Deal",
          url: "https://example.com/deal",
          price: 10,
          currency: "EUR",
          expires_at: "2026-02-09T12:00:00Z"
        }
      });

      const stableCreate: any = dealsCreate.structuredContent;
      expect(stableCreate.ok).toBe(true);
      expect(stableCreate.data.deal.deal_id).toBe("deal-1");

      const postReq = captured.find((r) => r.method === "POST" && r.url === "/api/v1/deals");
      expect(postReq).toBeTruthy();
      expect(String(postReq!.headers["idempotency-key"])).toBe("idem-1");
      const parsedBody = JSON.parse(postReq!.body || "{}");
      expect(parsedBody.idempotency_key).toBeUndefined();
      expect(parsedBody.title).toBe("Test Deal");
    } finally {
      await client.close();
    }
  }, 30000);

  it("supports bootstrap mode without API key and exposes connect.setup", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: ["scripts/mcp-server.mjs"],
      cwd: process.cwd(),
      stderr: "pipe",
      env: {
        CLAWDEALS_API_BASE: apiBase,
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      }
    });

    const client = new Client({ name: "mcp-test-client-bootstrap", version: "0.0.0" });
    await client.connect(transport);

    try {
      const list = await client.listTools();
      expect(list.tools.length).toBe(20);
      expect(list.tools.some((tool) => tool.name === "clawdeals.connect.setup")).toBe(true);

      const blocked = await client.callTool({
        name: "clawdeals.deals.list",
        arguments: { limit: 1 }
      });
      const blockedStable: any = blocked.structuredContent;
      expect(blocked.isError).toBe(true);
      expect(blockedStable.ok).toBe(false);
      expect(blockedStable.error.code).toBe("NOT_CONFIGURED");

      const initiated = await client.callTool({
        name: "clawdeals.connect.setup",
        arguments: {
          step: "initiate",
          agent_name: "Bootstrap Test",
          client_type: "claude-code"
        }
      });
      const initiatedStable: any = initiated.structuredContent;
      expect(initiated.isError).toBe(false);
      expect(initiatedStable.ok).toBe(true);
      expect(initiatedStable.data.session_id).toBeTruthy();
      expect(initiatedStable.data.poll_token).toBeTruthy();
      expect(initiatedStable.data.claim_url).toContain("/claim/");
      expect(initiatedStable.data.api_key).toBeUndefined();

      const sessionId = initiatedStable.data.session_id;
      const pollToken = initiatedStable.data.poll_token;

      const polled = await client.callTool({
        name: "clawdeals.connect.setup",
        arguments: {
          step: "poll",
          session_id: sessionId,
          poll_token: pollToken
        }
      });
      const polledStable: any = polled.structuredContent;
      expect(polledStable.ok).toBe(true);
      expect(polledStable.data.status).toBe("PENDING_CLAIM");

      const createReq = captured.find((r) => r.method === "POST" && r.url === "/api/v1/connect/sessions");
      expect(createReq).toBeTruthy();
      expect(String(createReq!.headers["idempotency-key"] || "")).not.toBe("");

      const pollReq = captured.find((r) => r.method === "GET" && r.url.startsWith("/api/v1/connect/sessions/"));
      expect(pollReq).toBeTruthy();
      expect(String(pollReq!.headers.authorization)).toBe(`Bearer ${pollToken}`);
    } finally {
      await client.close();
    }
  }, 30000);
});
