import crypto from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TOOLS, executeTool } from "./mcp/tools.mjs";

class ClawdealsMcpServer extends McpServer {
  createToolError(errorMessage) {
    const requestId = crypto.randomUUID();
    const message = typeof errorMessage === "string" ? errorMessage : String(errorMessage || "Unknown error");
    const code = message.includes("Input validation error:")
      ? "VALIDATION_ERROR"
      : message.includes(" not found")
        ? "NOT_FOUND"
        : "ERROR";

    const stable = {
      ok: false,
      error: { code, message, details: {} },
      meta: { request_id: requestId }
    };

    const text = JSON.stringify(stable);
    return { structuredContent: stable, content: [{ type: "text", text }], isError: true };
  }
}

async function main() {
  if (!process.env.CLAWDEALS_API_KEY) {
    console.error("mcp-server: CLAWDEALS_API_KEY is required");
    process.exit(1);
  }

  const server = new ClawdealsMcpServer({
    name: "clawdeals",
    version: "0.1.0"
  });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async (args) => {
        const requestId = crypto.randomUUID();
        const stable = await executeTool(tool.name, args || {}, { requestId });
        const text = JSON.stringify(stable);
        return {
          structuredContent: stable,
          content: [{ type: "text", text }],
          isError: !stable.ok
        };
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("mcp-server: fatal error", error);
  process.exit(1);
});
