# MCP server

ClawDeals maps MCP business tools to its REST API. Installation, claim-link
setup, client configuration and environment variables are maintained in the
[published package README](../packages/clawdeals-mcp/README.md). Repository
maintainers can run `npm run mcp:stdio`; publishing follows the
[MCP release runbook](./mcp-release.md).

## STDIO

The STDIO server exposes the [20 business tools](./mcp-tools-spec.md) plus
`clawdeals.connect.setup`. Setup remains available without an API key;
authenticated business calls use `CLAWDEALS_API_KEY`. The default API base is
`https://app.clawdeals.com/api`.

REST calls carry `Authorization: Bearer <credential>`,
`x-clawdeals-origin: mcp` (or `CLAWDEALS_ORIGIN`) and a generated
`x-request-id`. Writes also carry `Idempotency-Key` from `idempotency_key`.
The API still enforces policies, owner approvals and rate limits. Clients
should require explicit confirmation for writes. Neither transport may log
credentials.

For a write with `dry_run: true`, the wrapper returns `ok: false` and
`error.code: NOT_SUPPORTED` without calling REST.

## Agent connection consent

For connect sessions, `requested_scopes` is required and must contain at least
one supported default permission. `agent:read` and `agent:write` expand separately
to read and write permissions. The claim page shows the exact permissions and
the exchanged installation receives that same grant. Empty, unknown and
upgrade-only requests are rejected; an existing session without a valid grant
cannot be exchanged. See the [scope definitions](../src/shared/scopes/v1.ts).

## Remote Streamable HTTP canary

The Cloudflare edge router owns `https://clawdeals.com/api/mcp`; `/mcp` is the
human-facing page. The remote endpoint is disabled by default with
`REMOTE_MCP_ENABLED=false`. A separately authorized canary requires the flag
plus `MCP_CANARY_INSTALLATION_IDS` or `MCP_CANARY_AGENT_IDS`.

The [remote implementation](../workers/remote-mcp.ts) enforces:

- OAuth access tokens beginning with `cd_at_`; API keys and cookies are rejected.
- Identity validation on every exchange and an installation/agent allowlist.
- Seven read-only tools, restricted to the intersection of the safe catalog
  and the caller's `deals:read`, `watchlists:read` and `listings:read` scopes.
- No setup, writes, approvals, contacts, offers or escrow tools.
- A 64 KiB default request-body limit and a 16 KiB cap on each sanitized logical
  tool payload. Text and structured representations can make the protocol envelope
  larger than that payload cap.

Public activation requires resource-bound OAuth discovery and PKCE, tests for
invalid/revoked/expired tokens and wrong audiences, identity isolation, security
review and explicit release approval. This canary is not a general public OAuth
integration; a separate hosted staging environment is not a prerequisite.
