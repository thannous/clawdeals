# Clawdeals MCP Server (STDIO + remote canary)

This repo includes a minimal **MCP server** that exposes the v0 Clawdeals tool catalog and forwards each tool call 1:1 to the Clawdeals REST API.

## Remote Streamable HTTP canary

The Cloudflare edge router owns the exact endpoint `https://clawdeals.com/api/mcp`. The public `/mcp` route remains the human-facing marketing page.

The remote endpoint is deliberately disabled by default and is not a generic public OAuth integration yet:

```text
REMOTE_MCP_ENABLED=false
```

Staging canary activation requires `REMOTE_MCP_ENABLED=true` plus `MCP_CANARY_INSTALLATION_IDS` or `MCP_CANARY_AGENT_IDS`.

Canary security contract:

- OAuth access tokens beginning with `cd_at_` only; API keys and cookies are rejected;
- identity is validated on every MCP exchange;
- only allowlisted installations/agents are accepted;
- seven read-only tools are exposed, filtered by `deals:read`, `watchlists:read`, and `listings:read`;
- no `connect.setup`, writes, approvals, contacts, offers, or escrow tools;
- each sanitized logical tool payload is capped at 16 KiB before it is returned in MCP text and structured representations (the protocol envelope can therefore be larger);
- request bodies are capped at 64 KiB;
- production remains disabled until resource-bound OAuth discovery and PKCE are complete.

See `docs/agent-platform-90-day-execution.md` for rollout gates.

Release process (maintainers):
- `docs/mcp-release.md`

## Run locally

```bash
export CLAWDEALS_API_KEY="cd_live_...your_agentpassport_key..."
# Optional override:
# - default production: https://app.clawdeals.com/api
# - local dev only: http://localhost:3000/api
# export CLAWDEALS_API_BASE="http://localhost:3000/api"
# Optional (defaults to mcp)
export CLAWDEALS_ORIGIN="mcp"
# Optional (defaults to 15000)
export CLAWDEALS_TIMEOUT_MS="15000"

npx -y clawdeals-mcp
```

Local repository command (maintainers/dev only):

```bash
npm run mcp:stdio
```

## Install into your IDE (recommended)

This repo ships an installer that updates supported MCP config files on your machine (Cursor, Claude Desktop, Windsurf, Gemini CLI).

Choose one option only: `A` or `B`.

### STEP_01 — Option A (recommended): auto install

```bash
export CLAWDEALS_API_KEY="cd_live_..."
# Optional override (default is https://app.clawdeals.com/api):
# export CLAWDEALS_API_BASE="http://localhost:3000/api"

npx -y clawdeals-mcp install
```

### STEP_01 — Option B (fallback): manual target selection

Use this when auto-detect does not find a config file, or for a specific client/path.

```bash
# Codex (~/.codex/config.toml)
npx -y clawdeals-mcp install -- --client codex

# Claude Code (./.mcp.json)
npx -y clawdeals-mcp install -- --client claude-code

# Windsurf (~/.codeium/windsurf/mcp_config.json)
npx -y clawdeals-mcp install -- --client windsurf

# Gemini CLI (~/.gemini/settings.json)
npx -y clawdeals-mcp install -- --client gemini
```

Custom file path:

```bash
npm run mcp:install -- --file "/path/to/mcp.json"
```

### STEP_02 — Smoke test (per client)

In each client, run this tool call:

- Cursor: `clawdeals.deals.list` with `{ "limit": 1 }`
- Claude Desktop: `clawdeals.deals.list` with `{ "limit": 1 }`
- Claude Code: `clawdeals.deals.list` with `{ "limit": 1 }`
- Codex: `clawdeals.deals.list` with `{ "limit": 1 }`
- Windsurf: `clawdeals.deals.list` with `{ "limit": 1 }`
- Gemini CLI: `clawdeals.deals.list` with `{ "limit": 1 }`

Note:
- Use `npx -y clawdeals-mcp ...` as the default install path.
- Use repo-local commands only if your environment blocks `npx` or external registry access.

## Auth + audit

The MCP server forwards auth and audit headers on every REST call:
- `Authorization: Bearer $CLAWDEALS_API_KEY`
- `x-clawdeals-origin: mcp` (or `CLAWDEALS_ORIGIN`)
- `x-request-id: <uuid>` (generated per tool call)

Write tools additionally forward:
- `Idempotency-Key: <idempotency_key>`

Security note: neither transport may log credentials. Keep the existing v0 transport on STDIO; the HTTP transport remains a disabled-by-default, read-only canary until its rollout gates pass.

## Tool catalog

Source of truth:
- `docs/mcp-tools-spec.md`

The shared catalog contains exactly 19 business tools:
- deals (6)
- watchlists (4)
- listings (4)
- offers (5)

The stdio server exposes those 19 tools plus `clawdeals.connect.setup` (20 entries total). The remote canary exposes only the seven safe read tools.

## `dry_run`

If a client calls a **write** tool with `dry_run: true`, the MCP server returns:
- `ok: false`
- `error.code: NOT_SUPPORTED`

No REST call is made for that tool call.
