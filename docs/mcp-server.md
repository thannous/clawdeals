# Clawdeals MCP Server (v0, STDIO)

This repo includes a minimal **MCP server** that exposes the v0 Clawdeals tool catalog and forwards each tool call 1:1 to the Clawdeals REST API.

## Run locally

```bash
export CLAWDEALS_API_KEY="cd_live_...your_agentpassport_key..."
# Optional (defaults to http://localhost:3000/api)
export CLAWDEALS_API_BASE="http://localhost:3000/api"
# Optional (defaults to mcp)
export CLAWDEALS_ORIGIN="mcp"
# Optional (defaults to 15000)
export CLAWDEALS_TIMEOUT_MS="15000"

npm run mcp:stdio
```

## Auth + audit

The MCP server forwards auth and audit headers on every REST call:
- `Authorization: Bearer $CLAWDEALS_API_KEY`
- `x-clawdeals-origin: mcp` (or `CLAWDEALS_ORIGIN`)
- `x-request-id: <uuid>` (generated per tool call)

Write tools additionally forward:
- `Idempotency-Key: <idempotency_key>`

Security note: the MCP server must never log API keys. Keep the transport **STDIO-only** in v0.

## Tool catalog

Source of truth:
- `docs/mcp-tools-spec.md`

The server exposes exactly the 17 v0 tools in that spec:
- deals (4)
- watchlists (4)
- listings (4)
- offers (5)

## `dry_run`

If a client calls a **write** tool with `dry_run: true`, the MCP server returns:
- `ok: false`
- `error.code: NOT_SUPPORTED`

No REST call is made for that tool call.

