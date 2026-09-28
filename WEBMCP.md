# WebMCP — ClawDeals

ClawDeals registers contextual tools on the current marketplace page.

## Runtime and tool registry

Demo routes (`/webmcp`, `/webmcp-challenge`) and marketplace surfaces enable the
runtime without a feature flag. Developer routes require
`NEXT_PUBLIC_WEBMCP_ENABLED=1`. Browser API support is still required.

The maintained route rules are in [config.ts](./src/webmcp/config.ts).
The contextual catalog is in [tools/index.ts](./src/webmcp/tools/index.ts);
available tools depend on the page and whether an agent key is present.
The full catalog is not exposed on every page.

## Controls

- Public search tools work without an agent key.
- Authenticated actions retain API authorization and confirmation controls.
- Owner approval tools are scoped to owner approval pages.
- Tool output is sanitized and capped at 1,500 bytes by
  [output-cap.ts](./src/webmcp/security/output-cap.ts).
- Requests carry `X-Client-Channel: webmcp`.

See the [development notes](./WEBMCP_DEV.md) and [evaluations](./evals/webmcp/README.md).
