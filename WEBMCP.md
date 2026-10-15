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

## Prices and mission forms

Listing search filters and mission budgets use major currency units, matching
`listing.price.amount`: send `price_max: 100` for a 100 EUR or GBP limit, never
multiply by 100. Search min/max filters currently accept whole units; mission
budgets and their confirmation field accept positive decimals, preserving cents.
Other tools retain their existing integer validation. No currency conversion is performed, so compare
the returned currency before making a decision.

The mission form supports both human and agent submissions. Only a submit event
with `agentInvoked` calls `respondWith`, as required by the
[browser contract](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/webmcp/agentic-forms.md).
Human submits still require the existing confirmation gate. Missing keys produce
an actionable connection error; rejected executions clear the loading state and
report an unknown outcome instead of silently retrying a possible write.

See the [development notes](./WEBMCP_DEV.md) and [evaluations](./evals/webmcp/README.md).
