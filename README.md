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

Fill `.env.local` for the selected backend. [Local database setup](./docs/local-supabase-development.md) is optional; [environment policy](./docs/release-environments.md) documents the supported targets and the explicit opt-in for authorized disposable production data. Then run:

```bash
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Open `/webmcp` for the demo or `/dev/webmcp` for the development playground.
See [WebMCP](./WEBMCP.md) for registration and tool behavior.

## Validation

Choose checks for the changed behavior. Use `npm run test:testerarmy` for new or
affected browser journeys; existing Playwright suites keep their runner. See the
[test guide](./docs/testerarmy-e2e.md) for targets, fixtures and rerun commands.
Documentation-only changes need link and diff checks.

Before pushing, commit the intended files and run `npm run verify:pr`: it checks
the commit in isolation, not uncommitted work. The installed pre-push hook checks
secrets and file hygiene. Production requires `verify:release` on the merged SHA
and thanh's go; follow the [release procedure](./docs/release-staging-to-prod.md).

Dependency maintenance: `eslint-config-next` 16.3.3 / React Hooks 7.0.1 is pinned
because the 16.4.2 / 7.1.1 pilot exposed existing component errors. Revisit with
targeted fixes, without disabling rules. The private `braces` patch and its
replacement criteria are documented in [tools/braces](./tools/braces/README.md).

## Development references

- [Repository guidelines](./AGENTS.md) and [documentation index](./docs/README.md).
- [First purchase mission](./docs/first-buy-mission.md): product behavior and verification boundaries.
- [Hosting topology](./docs/hosting-cloudflare-vercel.md): Cloudflare edge router and Vercel app.
- [Environment policy](./docs/release-environments.md) and [release procedure](./docs/release-staging-to-prod.md).
- [REST API](./docs/openapi-v1.yaml), [MCP server](./docs/mcp-server.md) and [SDKs](./sdk/typescript/README.md).

## License

Proprietary. See [LICENSE](./LICENSE). Third-party materials retain their own licenses.
