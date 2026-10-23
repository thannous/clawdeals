# Development environments

Updated 2026-10-11. The owner-approved scope is in [AGENTS.md](../AGENTS.md); this is the reference for test target selection.

## Current workflow

- Changes reach `main` through a reviewed PR after local `npm run verify:pr` passes on the commit being pushed. Automatic Git deployments are disabled for every branch in `vercel.json`. Publish the exact merged `main` commit to `clawdeals` at `https://app.clawdeals.com` only on thanh's go, after `npm run verify:release` passes on that SHA; see the [validation gate](./hosting-cloudflare-vercel.md#current-development-topology-2026-09-28).
- During this development phase, the owner confirms there are no real users and production data is fictitious and disposable. Relevant validation may create, modify, and delete test data there without repeated approval.
- `clawdeals-staging` and its Vercel deployments were deleted on 2026-09-28. Neither `sandbox.clawdeals.com` nor the older `staging.app.clawdeals.com` is an available test target.
- Local services remain an option; a separate staging project, staging branch or staging-promotion step is not required. PR review and thanh's production go still apply.
- This authorization covers development/test data, not real payments, third-party messages, unrelated infrastructure deletion, or arbitrary changes to access controls. Revisit it before real users or real data arrive.

## Policy versus executable tooling

The permission is implemented by a project-scoped opt-in in participating test entrypoints:

| Tool | Current behavior |
| --- | --- |
| `playwright.config.ts`, `e2e.config.ts` (TesterArmy), integration helpers and `scripts/smoke-api.mjs` | Call `scripts/lib/assert-non-prod-target.mjs`; production is rejected by default; the opt-in below permits only the ClawDeals project and local services. |
| `/api/v1/sandbox/reset` and `/api/v1/sandbox/seller-turn` | Require sandbox runtime and a non-production database; reset/judge authorization still applies. |
| `bootstrap:webmcp:judge` | Historical remote-sandbox bootstrap with explicit host and project restrictions; not a setup step for production. |
| Local UI specs with mocked responses | Can run without backend credentials when the selected spec does not require real API data. |

Use `CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy` on a supported local TesterArmy, Playwright, integration or smoke command when its fixtures are appropriate for this shared disposable dataset. A value such as `true`, another project/host, or a hosted Vercel runtime (`VERCEL=1`) does not qualify. The flag does not enable migration exporters, bulk cleanup or sandbox reset endpoints. Do not set it in Vercel and do not label production as `CLAWDEALS_ENV=sandbox`.

The [SDK/MCP journey](./testerarmy-e2e.md#verify-the-sdk-and-mcp-journey) uses a local app, local Redis mock and the selected authorized database. It creates unique agents and retires only its own keys, listings and watchlists.

## Credentials and target selection

Keep credentials out of Git, command output and shared reports. `.env.local` is ignored by Git and loaded by Next.js and the Playwright configuration. Its presence does not prove the target or credentials are correct.

- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`: actual backend URL; service-role secrets stay server-side.
- `E2E_BASE_URL`: app origin, without `/api`; also skips Playwright's local server startup. TesterArmy target selection is documented in [its runner guide](./testerarmy-e2e.md).
- `API_BASE_URL`: Playwright integration origin, without `/api` (specs append API paths).
- `CLAWDEALS_API_BASE`: REST client/skill base including `/api`.
- `PW_WEB_SERVER_MODE=prod`: local build-and-start mode, not permission to target a hosted production database.
- `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS`: local test compatibility only; do not enable it on the public deployment.

Use [local setup](./local-supabase-development.md) when a test needs sandbox fixtures. The [sandbox guide](./sandbox-getting-started.md) describes that optional runtime, not a required hosted environment.

## API smoke

`npm run test:smoke` loads `.env.local` and needs a running API server plus
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IDEMPOTENCY_SECRET` and either
`MESSAGE_REDACTION_HMAC_SECRET` or `AUDIT_HMAC_SECRET`. Check that its fixtures
suit the selected backend before running it. `SMOKE_BASE_URL` selects the app
origin (default `http://localhost:3000`). For the authorized disposable
ClawDeals database:

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
  npm run test:smoke
```

Use [OpenAPI](./openapi-v1.yaml) for the API inventory; internal cron
authentication and schedules are covered by [hosting](./hosting-cloudflare-vercel.md#scheduled-jobs).

## Validation and releases

Select checks for the requested change. Do not run the full suite for a documentation-only change. For E2E evidence retain the exact command, target, fixture prerequisites, results and report/trace.

The checked-in CI (`.github/workflows/ci.yml`) is a single `test-ci` job: lint, type/i18n/OpenAPI/skill contracts, unit tests and a Worker dry-run bundle, then, once those pass, the [TesterArmy public browser journeys](./testerarmy-e2e.md) on desktop and mobile viewports. It runs on manual dispatch only, never as a merge gate. PRs are checked locally with `npm run verify:pr` on an isolated copy of the commit, and the PR states the verified commit and the result (`AGENTS.md`); the `pre-push` hook that `npm ci` installs only runs fast checks (forbidden files, secrets, size). The complete historical browser corpus is a separate workflow (`.github/workflows/historical-corpus.yml`), also on manual dispatch only, that skips a commit that already passed it. CI does not run the database integration suites, apply database migrations or deploy Cloudflare. SDK checks and the npm/PyPI releases (each a manual dispatch with a version input) are separate workflows, all dispatch-only. A CI configuration or result is neither proof of deployment nor authorization to publish; the local release gate and thanh's go remain required.

See [release procedure](./release-staging-to-prod.md) and [hosting](./hosting-cloudflare-vercel.md).
