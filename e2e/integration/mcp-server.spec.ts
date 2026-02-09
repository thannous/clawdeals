import { test, expect } from "@playwright/test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { assertIntegrationEnv, getApiBaseUrl } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: MCP server (stdio)", () => {
  test.setTimeout(60000);

  test("deals.create forwards auth+origin+idempotency and audit captures it", async () => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey, apiKeyId } = await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();

    const transport = new StdioClientTransport({
      command: "node",
      args: ["scripts/mcp-server.mjs"],
      cwd: process.cwd(),
      stderr: "pipe",
      env: {
        CLAWDEALS_API_KEY: apiKey,
        CLAWDEALS_API_BASE: `${getApiBaseUrl()}/api`,
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      }
    });

    const client = new Client({ name: "e2e-mcp-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const idemKey = randomId();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const result = await client.callTool({
        name: "clawdeals.deals.create",
        arguments: {
          idempotency_key: idemKey,
          title: `MCP Deal ${randomId()}`,
          url: `https://example.com/p/${randomId()}`,
          price: 39.99,
          currency: "EUR",
          expires_at: expiresAt,
          tags: ["mcp"]
        }
      });

      expect(result.isError).toBeFalsy();
      const stable: any = result.structuredContent;
      expect(stable.ok).toBe(true);
      expect(stable.meta?.request_id).toBeTruthy();

      const requestId = stable.meta.request_id;
      const audit = await waitForAuditLog(supabase, "deal.create", 15, auditSince, requestId);
      expect(audit).not.toBeNull();

      expect(audit.security?.origin).toBe("mcp");
      expect(audit.auth?.api_key_id).toBe(apiKeyId);
      expect(audit.auth?.agent_id).toBe(agent.id);
      expect(audit.idempotency?.key).toBe(idemKey);
    } finally {
      await client.close();
    }
  });
});

