# WebMCP development

Start the app with `NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev`, then open
`/dev/webmcp`. Configure isolated local services following the
[sandbox guide](./docs/sandbox-getting-started.md).

Verify browser capabilities in the target runtime; a previous browser result does not establish current support.

## Validation

- `npm run eval:webmcp:contracts`: tool, authorization and output contracts.
- `npm run eval:webmcp:ui`: browser UI behavior.
- `npm run eval:webmcp:journey`: isolated buyer/seller API journeys.
- `npm run eval:webmcp:security`: isolated authorization journeys.

For a manual write check, use synthetic data and an agent key in the local
playground. Deny an action first, then approve it. Verify that denial sends no
write and approval sends the expected authenticated request with its idempotency key.

Playwright compatibility injection validates application behavior, not native
browser WebMCP support. See [evaluations](./evals/webmcp/README.md) for proof boundaries.
