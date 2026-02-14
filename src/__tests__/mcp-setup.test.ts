import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

function repoRootFromImportMetaUrl(url: string) {
  const here = path.dirname(fileURLToPath(url)); // <repo>/src/__tests__
  return path.resolve(here, "../..");
}

type SetupEvent = {
  event: string;
  [key: string]: unknown;
};

describe("mcp/setup-cli.mjs", () => {
  let apiServer: http.Server;
  let apiBase: string;
  let pollCount = 0;
  let verifyHeaders: string[] = [];

  beforeAll(async () => {
    apiServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      await new Promise<void>((resolve) => req.on("end", resolve));

      const bodyText = Buffer.concat(chunks).toString("utf8");
      const body = bodyText ? JSON.parse(bodyText) : {};

      res.setHeader("content-type", "application/json; charset=utf-8");

      if (req.method === "POST" && req.url === "/api/v1/connect/sessions") {
        expect(req.headers["idempotency-key"]).toBeTruthy();
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
              interval_seconds: 1
            }
          })
        );
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/api/v1/connect/sessions/")) {
        pollCount += 1;
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              session_id: "11111111-1111-4111-8111-111111111111",
              status: pollCount >= 2 ? "CLAIMED" : "PENDING_CLAIM",
              claimed_at: pollCount >= 2 ? "2026-02-14T12:00:01.000Z" : null,
              expires_at: "2026-02-14T12:00:00.000Z"
            }
          })
        );
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/api/v1/connect/sessions/") && req.url.endsWith("/exchange")) {
        expect(req.headers.authorization).toBe("Bearer cd_poll_test");
        expect(req.headers["idempotency-key"]).toBeTruthy();
        expect(body.requested_key_scope).toBe("agent_write");
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              session_id: "11111111-1111-4111-8111-111111111111",
              status: "DELIVERED",
              agent_id: "agent_test",
              installation_id: "inst_test",
              api_key: "cd_live_secret_setup",
              api_key_id: "key_test",
              issued_at: "2026-02-14T12:00:02.000Z"
            }
          })
        );
        return;
      }

      if (req.method === "GET" && req.url === "/api/v1/agents/me") {
        const auth = String(req.headers.authorization || "");
        verifyHeaders.push(auth);
        if (auth !== "Bearer cd_live_secret_setup") {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "invalid" } }));
          return;
        }
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              agent_id: "agent_test",
              name: "Setup Test",
              owner_id: null,
              installation_id: "inst_test",
              oauth_scopes: []
            }
          })
        );
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
    if (!addr || typeof addr === "string") throw new Error("Failed to bind setup test server");
    apiBase = `http://127.0.0.1:${addr.port}/api`;
  });

  beforeEach(() => {
    pollCount = 0;
    verifyHeaders = [];
  });

  afterAll(async () => {
    if (!apiServer) return;
    if (!apiServer.listening) return;
    await new Promise<void>((resolve, reject) => {
      apiServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function runSetup({
    cwd,
    args = []
  }: {
    cwd: string;
    args?: string[];
  }) {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);
    const scriptPath = path.join(repoRoot, "packages", "clawdeals-mcp", "mcp", "setup-cli.mjs");
    return await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("node", [scriptPath, ...args], {
        cwd,
        env: {
          ...process.env,
          CLAWDEALS_API_BASE: apiBase,
          CLAWDEALS_ORIGIN: "mcp"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk || "");
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      child.on("close", (status) => {
        resolve({ status, stdout, stderr });
      });
    });
  }

  function parseJsonEvents(stdout: string): SetupEvent[] {
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  it("runs full setup flow and never prints api key", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-setup-cli-"));
    const result = await runSetup({
      cwd: dir,
      args: ["--client", "claude-code", "--agent-name", "CLI Setup Test", "--json"]
    });

    expect(result.status ?? -1).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("cd_live_secret_setup");
    expect(verifyHeaders).toContain("Bearer cd_live_secret_setup");

    const configPath = path.join(dir, ".mcp.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const parsedConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as any;
    expect(parsedConfig?.mcpServers?.clawdeals?.env?.CLAWDEALS_API_KEY).toBe("cd_live_secret_setup");

    const events = parseJsonEvents(result.stdout);
    expect(events.some((event) => event.event === "claim_required")).toBe(true);
    expect(events.some((event) => event.event === "success")).toBe(true);
  });

  it("supports --dry-run without writing config file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-setup-cli-dry-run-"));
    const result = await runSetup({
      cwd: dir,
      args: ["--client", "claude-code", "--dry-run", "--json"]
    });

    expect(result.status ?? -1).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("cd_live_secret_setup");
    expect(fs.existsSync(path.join(dir, ".mcp.json"))).toBe(false);

    const events = parseJsonEvents(result.stdout);
    const finalized = events.find((event) => event.event === "finalized");
    expect(finalized).toBeTruthy();
    expect(finalized?.wrote).toBe(false);
  });
});
