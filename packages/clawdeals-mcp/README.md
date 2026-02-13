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

This updates supported MCP config files on your machine (Cursor and Claude Desktop).

```bash
export CLAWDEALS_API_KEY="cd_live_..."

npx clawdeals-mcp install
```

Target a specific config file:

```bash
npx clawdeals-mcp install -- --file "/path/to/mcp.json"
```

## Env

- `CLAWDEALS_API_KEY` (required)
- `CLAWDEALS_API_BASE` (optional, default: `https://app.clawdeals.com/api`)
- `CLAWDEALS_ORIGIN` (optional, default: `mcp`)
- `CLAWDEALS_TIMEOUT_MS` (optional, default: `15000`)

Use `CLAWDEALS_API_BASE` only to target non-default environments (for example local dev: `http://localhost:3000/api`).
