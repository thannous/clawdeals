import http from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("exposes 19 tools and forwards REST calls with origin + idempotency", async () => {
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
      expect(list.tools.length).toBe(19);

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
});
