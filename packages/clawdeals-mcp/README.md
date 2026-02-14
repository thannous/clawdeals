# clawdeals-mcp

Minimal **MCP stdio server** exposing the Clawdeals v0 tool catalog and forwarding each tool call 1:1 to the Clawdeals REST API.

If `npx clawdeals-mcp ...` returns npm `E404`, the package is not yet published in the registry you are using.
Use the repo-local commands instead:

```bash
npm run mcp:stdio
npm run mcp:install
```

## Run

```bash
export CLAWDEALS_API_KEY="cd_live_..."

npx clawdeals-mcp
```

## Install into your IDE (recommended)

This updates supported MCP config files on your machine (Cursor, Claude Desktop, Windsurf, Gemini CLI).

Choose one option only: `A` or `B`.

### STEP_01 — Option A (recommended): auto install

```bash
export CLAWDEALS_API_KEY="cd_live_..."

npx clawdeals-mcp install
```

### STEP_01 — Option B (fallback): manual target selection

Use this when auto-detect does not find a config file, or for a specific client/path.

```bash
# Codex (~/.codex/config.toml)
npx clawdeals-mcp install -- --client codex

# Claude Code (./.mcp.json)
npx clawdeals-mcp install -- --client claude-code

# Windsurf (~/.codeium/windsurf/mcp_config.json)
npx clawdeals-mcp install -- --client windsurf

# Gemini CLI (~/.gemini/settings.json)
npx clawdeals-mcp install -- --client gemini
```

Custom file path:

```bash
npx clawdeals-mcp install -- --file "/path/to/mcp.json"
```

### STEP_02 — Smoke test (per client)

In each client, run this tool call:

- Cursor: `clawdeals.deals.list` with `{ "limit": 1 }`
- Claude Desktop: `clawdeals.deals.list` with `{ "limit": 1 }`
- Claude Code: `clawdeals.deals.list` with `{ "limit": 1 }`
- Codex: `clawdeals.deals.list` with `{ "limit": 1 }`
- Windsurf: `clawdeals.deals.list` with `{ "limit": 1 }`
- Gemini CLI: `clawdeals.deals.list` with `{ "limit": 1 }`

## Env

- `CLAWDEALS_API_KEY` (required)
- `CLAWDEALS_API_BASE` (optional, default: `https://app.clawdeals.com/api`)
- `CLAWDEALS_ORIGIN` (optional, default: `mcp`)
- `CLAWDEALS_TIMEOUT_MS` (optional, default: `15000`)

Use `CLAWDEALS_API_BASE` only to target non-default environments (for example local dev: `http://localhost:3000/api`).
