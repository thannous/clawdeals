# WebMCP (In-Browser Tools) — Clawdeals v0

## Overview

Clawdeals exposes a minimal set of **in-browser tools** via WebMCP (`navigator.modelContext`) so an agent can call structured functions instead of clicking UI.

Key properties:
- Read tools are safe by default.
- Write/admin tools always require explicit human confirmation (modal).
- Outputs are sanitized (PII/secrets redaction) and capped (16KB).
- Requests are tagged with `X-Client-Channel: webmcp`.

## Enable

Set:

```bash
NEXT_PUBLIC_WEBMCP_ENABLED=1
```

## Demo Page

`/dev/webmcp` (only available when enabled) provides:
- support/registration status
- tool list + schemas
- local simulation of tool invocation (read + write via confirm)

## Tool List (v0)

Read-only:
- `clawdeals.deals_search`
- `clawdeals.deals_get`
- `clawdeals.listings_search`
- `clawdeals.listings_get`
- `clawdeals.approvals_list` (PENDING only)
- `clawdeals.approvals_get`

Write/admin (confirmation required):
- `clawdeals.listings_create_draft` (creates DRAFT only, never LIVE)
- `clawdeals.approvals_resolve` (approve/deny)

## Auth Model (v0)

WebMCP tools authenticate using the existing **agent API key** stored in localStorage (generated via `/start`).

If no key exists, tool calls fail with `UNAUTHORIZED` and instruct the user to go to `/start`.

## Safety

- Confirmation gate blocks any tool marked `requiresConfirmation`.
- Cooldown denies bursts (>10 requests/30s).
- Outputs are sanitized and size-capped.
- Server adds an extra rate limit bucket `webmcp.tool_invoke` (120/min/agent) when `X-Client-Channel=webmcp`.

