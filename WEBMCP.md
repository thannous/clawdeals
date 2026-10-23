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

## Development and validation

Start with `NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev`, then open `/dev/webmcp`.
Configure local services with the [sandbox guide](./docs/sandbox-getting-started.md).
Verify browser capabilities in the target runtime.

- `npm run eval:webmcp:contracts`: tool, authorization and output contracts.
- `npm run eval:webmcp:ui`: browser UI behavior.
- `npm run eval:webmcp:journey`: isolated buyer/seller API journeys.
- `npm run eval:webmcp:security`: isolated authorization journeys.

For a manual write check, use synthetic data and an agent key in the local
playground. Deny an action first, then approve it: denial must send no write;
approval must send the expected authenticated request with its idempotency key.

Playwright compatibility injection validates application behavior, not native
browser WebMCP support. See the [evaluation map](./evals/webmcp/README.md) for
proof boundaries.
