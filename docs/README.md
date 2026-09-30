# Documentation

Use only the references needed for the task. Updated 2026-09-28.

## Current development references

| Task | Read |
| --- | --- |
| Repository workflow and permissions | [AGENTS.md](../AGENTS.md) |
| Select an environment or understand production-test blockers | [Environment policy](./release-environments.md) |
| Push/deploy and verify a release | [Direct-main release procedure](./release-staging-to-prod.md) |
| Configure local fixture services | [Local setup](./local-supabase-development.md), [optional sandbox runtime](./sandbox-getting-started.md) |
| Change hosting, proxying or schedules | [Hosting](./hosting-cloudflare-vercel.md), [edge router](./deploy-edge-router.md), [market infrastructure](./launch-eu-fr-gb-es.md) |
| Work on WebMCP | [Overview](../WEBMCP.md), [development](../WEBMCP_DEV.md), [validation map](../evals/webmcp/README.md) |
| Integrate REST/MCP/SDK | [OpenAPI](./openapi-v1.yaml), [errors](./error-codes.md), [MCP](./mcp-server.md), [tools](./mcp-tools-spec.md), [TypeScript SDK](../sdk/typescript/README.md), [Python SDK](../sdk/python/README.md) |
| Publish the MCP package | [MCP release](./mcp-release.md) |
| Diagnose runtime behavior | [Ops](./ops-middleware.md), [alerting](./observability/ti-289-alerting-runbook.md), [SLO targets](./ops-slo-sli-v1.md), [ranking](./ranking-v1.md) |
| Manage owner notifications or verify settings | [Notification settings](./notification-settings.md), [queue dispatch](./queue-event-dispatch.md) |
| Understand documentation drift and remaining work | [Audit and inventory](./documentation-audit-2026-09-28.md), [implemented fixes and evidence](./development-blockers-verification.md) |

The environment policy permits development tests on owner-confirmed fictitious production data; Playwright/smoke support an explicit project-scoped opt-in; sandbox resets and exporters remain protected. The hosted staging project has been deleted. Do not recreate it or impose a promotion gate because an old document mentions it.

## Plans and archives

`Clawdeals_*`, `tickets-phase-*`, old QA/coverage reports, the unit-test cleanup report and dated release evidence are preserved with an archive notice. They are not a current backlog, release requirement or current test result. Their paths remain stable for references.

The agent-platform roadmap, acquisition experiment, SEO plan and Supabase→Neon migration record are scoped plans or snapshots. Consult them when working on those topics; reverify their dated claims before using them as current facts. Competitor profiles are dated research, not live market intelligence.

`skills/clawdeals/` is the source for seven public Markdown files. After editing it, run `npm run sync:skill:public` and `npm run test:skill:public`; do not maintain the public copies independently. Imported implementation guidance under `.agents/skills/` is separate from product documentation and should be loaded only when relevant.
