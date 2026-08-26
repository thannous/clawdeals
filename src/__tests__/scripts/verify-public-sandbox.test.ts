import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_SANDBOX_DEFAULTS,
  assertProductionUrl,
  assertSandboxUrl,
  classifySandboxResetGet,
  redactSecrets,
  resolvePublicSandboxOptions,
  verifyPublicSandbox
} from "../../../scripts/lib/verify-public-sandbox.mjs";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    redirected: status >= 300 && status < 400,
    headers: new Headers(headers),
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    }
  };
}

function createFetchMock(routes: Record<string, (init?: RequestInit) => ReturnType<typeof jsonResponse>>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    if (method !== "GET") {
      throw new Error(`unexpected ${method} ${url}`);
    }
    const headers = Object.fromEntries(
      Object.entries(init.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])
    );
    calls.push({ url, method, headers });
    const handler = routes[url];
    if (!handler) throw new Error(`unexpected fetch ${url}`);
    return handler(init);
  };
  return { fetchImpl, calls };
}

describe("verify-public-sandbox", () => {
  it("rejects production, http, and default vercel sandbox hosts", () => {
    expect(() => assertSandboxUrl("http://sandbox.clawdeals.com")).toThrow(/HTTPS/i);
    expect(() => assertSandboxUrl("https://clawdeals.com")).toThrow(/production host/i);
    expect(() => assertSandboxUrl("https://www.clawdeals.com")).toThrow(/production host/i);
    expect(() => assertSandboxUrl("https://app.clawdeals.com")).toThrow(/production host/i);
    expect(() => assertSandboxUrl("https://clawdeals-git-main.vercel.app")).toThrow(/vercel\.app/i);
    expect(() => assertSandboxUrl("https://attacker.example")).toThrow(/approved sandbox host/i);
    expect(assertSandboxUrl("https://sandbox.clawdeals.com/webmcp-challenge")).toBe(
      "https://sandbox.clawdeals.com"
    );
  });

  it("limits production reset probes to known HTTPS production hosts", () => {
    expect(assertProductionUrl("https://clawdeals.com")).toBe("https://clawdeals.com");
    expect(() => assertProductionUrl("http://clawdeals.com")).toThrow(/HTTPS/i);
    expect(() => assertProductionUrl("https://sandbox.clawdeals.com")).toThrow(/known production host/i);
  });

  it("treats unauthorized sandbox reset GET as acceptable non-production behavior", () => {
    expect(classifySandboxResetGet({ status: 401 })).toMatchObject({ ok: true, code: "UNAUTHORIZED" });
    expect(classifySandboxResetGet({ status: 403 })).toMatchObject({ ok: true, code: "UNAUTHORIZED" });
    expect(
      classifySandboxResetGet({ status: 200, body: { enabled: true, authorized: false } })
    ).toMatchObject({ ok: true, code: "SANDBOX_UNAUTHORIZED" });
    expect(classifySandboxResetGet({ status: 404 })).toMatchObject({ ok: false, code: "PRODUCTION_LIKE_404" });
    expect(
      classifySandboxResetGet({ status: 200, body: { enabled: true, authorized: true } })
    ).toMatchObject({ ok: false, code: "UNEXPECTED_AUTHORIZATION" });
    expect(
      classifySandboxResetGet({ status: 200, body: { enabled: false, authorized: false } })
    ).toMatchObject({ ok: false, code: "UNEXPECTED_RESET_GET" });
  });

  it("redacts judge keys and bearer tokens from reports", () => {
    const key = "cd_sandbox_examplekeyvalue.secretvalue";
    const rendered = redactSecrets(
      {
        Authorization: `Bearer ${key}`,
        note: key
      },
      [key]
    );
    expect(rendered).not.toContain(key);
    expect(rendered).toContain("[REDACTED]");
  });

  it("runs the GET-only acceptance sequence and skips judge auth without a key", async () => {
    const { fetchImpl, calls } = createFetchMock({
      "https://sandbox.clawdeals.com/webmcp-challenge": () =>
        jsonResponse(200, "<html>ok</html>", { "Origin-Agent-Cluster": "?1", "content-type": "text/html" }),
      "https://clawdeals.com/api/v1/sandbox/reset": () => jsonResponse(404, { error: { code: "NOT_FOUND" } }),
      "https://sandbox.clawdeals.com/api/v1/sandbox/reset": () =>
        jsonResponse(200, { enabled: true, authorized: false })
    });

    const report = await verifyPublicSandbox({
      env: {},
      fetchImpl,
      now: () => "2026-08-26T00:00:00.000Z"
    });

    expect(report.status).toBe("PASS");
    expect(report.mutations).toBe("NONE");
    expect(report.authenticated).toBe("SKIPPED");
    expect(report.expected_authenticated_tools).toEqual(PUBLIC_SANDBOX_DEFAULTS.AUTHENTICATED_TOOL_NAMES);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://sandbox.clawdeals.com/webmcp-challenge",
      "GET https://clawdeals.com/api/v1/sandbox/reset",
      "GET https://sandbox.clawdeals.com/api/v1/sandbox/reset"
    ]);
    expect(calls.every((call) => !call.headers.authorization)).toBe(true);
    expect(report.checks.map((check: { name: string }) => check.name)).toEqual([
      "sandbox_challenge_http_200",
      "sandbox_origin_agent_cluster",
      "production_reset_404",
      "sandbox_reset_get_non_production"
    ]);
  });

  it("optionally authenticates sandbox GET reset when a judge key is supplied", async () => {
    const judgeKey = "cd_sandbox_judgekeyvalue.secretvalue";
    const { fetchImpl, calls } = createFetchMock({
      "https://sandbox.clawdeals.com/webmcp-challenge": () =>
        jsonResponse(200, "ok", { "Origin-Agent-Cluster": "?1" }),
      "https://clawdeals.com/api/v1/sandbox/reset": () => jsonResponse(404, { error: { code: "NOT_FOUND" } }),
      "https://sandbox.clawdeals.com/api/v1/sandbox/reset": (init) => {
        const headers = Object.fromEntries(
          Object.entries(init?.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])
        );
        if (headers.authorization === `Bearer ${judgeKey}`) {
          return jsonResponse(200, { enabled: true, authorized: true, judge_agent_id: "93000000-0000-4000-8000-000000000001" });
        }
        return jsonResponse(200, { enabled: true, authorized: false });
      }
    });

    const report = await verifyPublicSandbox({
      env: { PUBLIC_SANDBOX_JUDGE_KEY: judgeKey },
      fetchImpl,
      now: () => "2026-08-26T00:00:00.000Z"
    });

    expect(report.status).toBe("PASS");
    expect(report.authenticated).toBe("PASS");
    expect(JSON.stringify(report)).not.toContain(judgeKey);
    const sandboxResetCalls = calls.filter(
      (call) => call.url === "https://sandbox.clawdeals.com/api/v1/sandbox/reset"
    );
    expect(sandboxResetCalls).toHaveLength(2);
    expect(sandboxResetCalls[0].headers.authorization).toBeUndefined();
    expect(sandboxResetCalls[1].headers.authorization).toBe(`Bearer ${judgeKey}`);
  });

  it("fails closed when the sandbox challenge redirects or production reset stays open", async () => {
    const { fetchImpl } = createFetchMock({
      "https://sandbox.clawdeals.com/webmcp-challenge": () =>
        jsonResponse(308, "", { location: "https://app.clawdeals.com/webmcp-challenge", "Origin-Agent-Cluster": "?1" }),
      "https://clawdeals.com/api/v1/sandbox/reset": () => jsonResponse(200, { enabled: true, authorized: false }),
      "https://sandbox.clawdeals.com/api/v1/sandbox/reset": () => jsonResponse(404, { error: { code: "NOT_FOUND" } })
    });

    const report = await verifyPublicSandbox({ env: {}, fetchImpl, now: () => "2026-08-26T00:00:00.000Z" });
    expect(report.status).toBe("FAIL");
    expect(report.checks.find((check: { name: string }) => check.name === "sandbox_challenge_http_200")?.status).toBe(
      "FAIL"
    );
    expect(report.checks.find((check: { name: string }) => check.name === "production_reset_404")?.status).toBe("FAIL");
    expect(
      report.checks.find((check: { name: string }) => check.name === "sandbox_reset_get_non_production")?.status
    ).toBe("FAIL");
  });

  it("exposes the GET-only CLI and refuses production sandbox URLs before any request", () => {
    const options = resolvePublicSandboxOptions({});
    expect(options.sandboxUrl).toBe("https://sandbox.clawdeals.com");
    expect(options.productionUrl).toBe("https://clawdeals.com");
    expect(options.judgeKey).toBeNull();

    const result = spawnSync(process.execPath, [path.resolve("scripts/verify-public-sandbox.mjs")], {
      cwd: process.cwd(),
      env: { ...process.env, PUBLIC_SANDBOX_URL: "https://app.clawdeals.com" },
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production host");
    expect(result.stderr).not.toMatch(/Bearer /);
  });

  it("does not inherit a generic judge key for the public sandbox", () => {
    const options = resolvePublicSandboxOptions({ WEBMCP_JUDGE_API_KEY: "cd_live_do-not-send.secret" });
    expect(options.judgeKey).toBeNull();
  });
});
