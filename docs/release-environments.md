# Development environments

Updated 2026-09-28. The owner-approved policy is in [AGENTS.md](../AGENTS.md).

## Current workflow

- Changes reach `main` through a reviewed PR. Automatic Git deployment from `main` is disabled in `vercel.json`: a `main` commit is published to `clawdeals` at `https://app.clawdeals.com` only on thanh's go, once that commit passes the [validation gate](./hosting-cloudflare-vercel.md#current-development-topology-2026-09-28).
- During this development phase, the owner confirms there are no real users and production data is fictitious and disposable. Relevant validation may create, modify, and delete test data there without repeated approval.
- `clawdeals-staging` and its Vercel deployments were deleted on 2026-09-28. Neither `sandbox.clawdeals.com` nor the older `staging.app.clawdeals.com` is an available test target.
- Local services remain an option; a separate staging project, staging branch, promotion step, or two-person release approval is not required.
- This authorization covers development/test data, not real payments, third-party messages, unrelated infrastructure deletion, or arbitrary changes to access controls. Revisit it before real users or real data arrive.

## Policy versus executable tooling

The permission is implemented by a project-scoped opt-in in participating test entrypoints:

| Tool | Current behavior |
| --- | --- |
| `playwright.config.ts`, `e2e.config.ts` (TesterArmy), integration helpers and `scripts/smoke-api.mjs` | Call `scripts/lib/assert-non-prod-target.mjs`; production is rejected by default; the opt-in below permits only the ClawDeals project and local services. |
| `/api/v1/sandbox/reset` and `/api/v1/sandbox/seller-turn` | Require sandbox runtime and a non-production database; reset/judge authorization still applies. |
| `bootstrap:webmcp:judge` | Historical remote-sandbox bootstrap with explicit host and project restrictions; not a setup step for production. |
| Local UI specs with mocked responses | Can run without backend credentials when the selected spec does not require real API data. |

Use `CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy` on a local Playwright or smoke command when its fixtures are appropriate for this shared disposable dataset. A value such as `true`, another project/host, or a hosted Vercel runtime (`VERCEL=1`) does not qualify. The flag does not enable migration exporters, bulk cleanup or sandbox reset endpoints. Do not set it in Vercel and do not label production as `CLAWDEALS_ENV=sandbox`.

The verified SDK/MCP journey uses a local app, local Redis mock and the authorized ClawDeals database. It creates unique agents and retires only its own keys, listings and watchlists. See [rerun command and evidence](./development-blockers-verification.md).

## Credentials and target selection

Keep credentials out of Git, command output and shared reports. `.env.local` is ignored by Git and loaded by Next.js and the Playwright configuration. Its presence does not prove the target or credentials are correct.

- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`: actual backend URL; service-role secrets stay server-side.
- `E2E_BASE_URL`: app origin, without `/api`; also skips Playwright's local server startup.
- `API_BASE_URL`: Playwright integration origin, without `/api` (specs append API paths).
- `CLAWDEALS_API_BASE`: REST client/skill base including `/api`.
- `PW_WEB_SERVER_MODE=prod`: local build-and-start mode, not permission to target a hosted production database.
- `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS`: local test compatibility only; do not enable it on the public deployment.

Use [local setup](./local-supabase-development.md) when a test needs sandbox fixtures. The [sandbox guide](./sandbox-getting-started.md) describes that optional runtime, not a required hosted environment.

## Validation and releases

Select checks for the requested change. Do not run the full suite for a documentation-only change. For E2E evidence retain the exact command, target, fixture prerequisites, results and report/trace.

The checked-in CI (`.github/workflows/ci.yml`) is a single `test-ci` job: lint, type/i18n/OpenAPI/skill contracts, unit tests and a Worker dry-run bundle, then, once those pass, the [TesterArmy public browser journeys](./testerarmy-e2e.md) on desktop and mobile viewports. It runs on manual dispatch only, never as a merge gate. PRs are checked locally with `npm run verify:pr` on an isolated copy of the commit, and the PR states the verified commit and the result (`AGENTS.md`); the `pre-push` hook that `npm ci` installs only runs fast checks (forbidden files, secrets, size). The complete historical browser corpus is a separate workflow (`.github/workflows/historical-corpus.yml`), also on manual dispatch only, that skips a commit that already passed it. CI does not run the database integration suites, apply database migrations or deploy Cloudflare. SDK checks and the npm/PyPI releases (each a manual dispatch with a version input) are separate workflows, all dispatch-only. CI configuration alone does not prove a current run passed or block Vercel deployment.

See [release procedure](./release-staging-to-prod.md) and [hosting](./hosting-cloudflare-vercel.md).
