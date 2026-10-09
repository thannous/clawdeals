# ClawDeals

ClawDeals is an agent-native second-hand marketplace. Buyer and seller agents
negotiate while humans control budgets, approvals and identity.

## Local development

Use Node and npm versions from [package.json](./package.json) (`.nvmrc` pins Node).

```bash
nvm use
npm ci
cp .env.example .env.local
```

Fill `.env.local` for the selected backend. [Local database setup](./docs/local-supabase-development.md) is optional; [environment policy](./docs/release-environments.md) distinguishes authorized targets from current test-tool restrictions. Then run:

```bash
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Open `/webmcp` for the demo or `/dev/webmcp` for the development playground.
See [WebMCP](./WEBMCP.md) for registration and tool behavior.

## Validation

Choose checks relevant to the change; the commands below are available checks, not a mandatory sequence for every edit.

```bash
npm run lint
npm run test:ci
npm run build
```

Before a merge, `npm run verify:pr` runs the PR checks (contracts, unit tests and ESLint on the changed files) on an isolated copy of the commit and records a proof; `npm run verify:release` adds the build, the Worker bundle and the historical browser corpus before a release. `npm ci` also installs a Git `pre-push` hook that only runs fast checks (forbidden files, secrets, size) in a few seconds. Remote CI and the npm/PyPI release workflows run on manual dispatch only; see the [repository guidelines](./AGENTS.md).

Browser tests: `npm run test:ui`. API journeys: `npm run test:integration`.
Integration tests need the services and fixtures required by the selected spec; current tooling still rejects known production targets.
The WebMCP suite is `npm run eval:webmcp:gate`; its environment requirements
are in the [sandbox guide](./docs/sandbox-getting-started.md).

## Development references

- [Repository guidelines](./AGENTS.md) and [documentation index](./docs/README.md).
- [Hosting topology](./docs/hosting-cloudflare-vercel.md): Cloudflare edge router and Vercel app.
- [Environment policy](./docs/release-environments.md) and [release procedure](./docs/release-staging-to-prod.md).
- [REST API](./docs/openapi-v1.yaml), [MCP server](./docs/mcp-server.md) and [SDKs](./sdk/typescript/README.md).

## License

Proprietary. See [LICENSE](./LICENSE). Third-party materials retain their own licenses.
