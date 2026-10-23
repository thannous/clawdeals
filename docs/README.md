# Documentation

Read the guide for the task; commands live in [package.json](../package.json).
[AGENTS.md](../AGENTS.md) owns repository permissions and delivery rules.

| Task | Reference |
| --- | --- |
| Start developing | [Root README](../README.md), [local database](local-supabase-development.md), [sandbox fixtures](sandbox-getting-started.md) |
| Choose a test target | [Environment policy](release-environments.md) |
| Run and diagnose journeys | [TesterArmy and SDK/MCP recipes](testerarmy-e2e.md), [console checks](ti-307-console-qa-checklist.md) |
| Deliver a change | [Release procedure](release-staging-to-prod.md), [hosting and edge router](hosting-cloudflare-vercel.md) |
| Change markets or localized content | [FR / GB / ES contract](launch-eu-fr-gb-es.md) |
| Work on buyer missions | [Mission contract](first-buy-mission.md), [magic-link return](owner-login-return.md), [owner deal visibility](owner-deals.md) |
| Work on smartphones | [Passports and photos](smartphone-passport.md), [comparison](smartphone-comparison.md), [passport-based missions](smartphone-passport-missions.md) |
| Integrate REST or SDKs | [OpenAPI](openapi-v1.yaml), [errors](error-codes.md), [TypeScript](../sdk/typescript/README.md), [Python](../sdk/python/README.md) |
| Integrate MCP | [Server and security](mcp-server.md), [tools](mcp-tools-spec.md), [package release](mcp-release.md) |
| Work on browser tools | [WebMCP](../WEBMCP.md), [evaluation guide](../evals/webmcp/README.md) |
| Run an external agent | [Reference scripts](reference-agent.md), [Cerebras buyer](cerebras-buyer-workflow.md), [local ChatGPT](../scripts/agents/chatgpt-local/README.md) |
| Diagnose notifications or ranking | [Preferences](notification-settings.md), [queue recovery](queue-event-dispatch.md), [ranking](ranking-v1.md) |
| Investigate service health | [Alerts, targets and triage](observability/ti-289-alerting-runbook.md) |
| Work on backend adapters | [Migration and rollback](migration-supabase-to-neon-vercel-blob.md) |

Keep one maintained guide per topic. Old plans, ticket exports, audits and dated
QA reports belong in Git history, not in the current reading list. Recover one
with `git log --all -- <path>` and `git show <commit>:<path>`. A historical result
never proves the current build; fresh runs retain their command, target, source
identity and useful artifacts as described in the test guide.

`skills/clawdeals/` owns the seven published Markdown files: after editing, run
`npm run sync:skill:public` and `npm run test:skill:public`. Keep those public
copies, package READMEs and generated SDK contracts in sync with their sources.
Imported guidance in `.agents/skills/` is separate from product documentation.
