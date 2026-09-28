# Development blockers — verified fixes

Verified 2026-09-28. This records the authorized remediation following the [documentation audit](./documentation-audit-2026-09-28.md). This is the pre-release verification record; database and Vercel configuration changes performed during verification are identified separately below. Deployment status must be checked against the released commit.

## Failure cases identified before implementation

- Production test permission must be explicit and limited to the known ClawDeals project. Missing/misspelled flags, hosted Vercel execution, unrelated callers and mixed remote targets must not unlock operations. Negative target combinations cannot safely be exercised by E2E writes; retain isolated guard tests for that coverage gap.
- SDK defaults must use the real API. The seller/buyer helper must require a separate authenticated buyer before creating a listing, preserve per-request idempotency and propagate partial failures.
- MCP must accept deal/listing matches, default to deals and reject unknown values while preserving authorization and response redaction. Verify across stdio and HTTP.
- OpenAPI nullable schemas must survive client generation. Route dispatchers and console/internal handlers require explicit classification, without invented public contracts.
- Credentials must remain ignored and private; retire only this run's records. No third-party messages or payments are included.
- Live verification exposed missing audit partitions. Maintenance must use a named RPC, create the current UTC month plus two successors, preserve RLS, deny unprivileged callers and fail on database errors. It must neither execute caller-supplied SQL nor delete old partitions.

## Implemented and verified

| Area | Result |
| --- | --- |
| Test guards | Playwright, integration helpers and smoke opt in only with `CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy`. Hosted Vercel execution, unrelated projects and mixed remote hosts are rejected. Exporters, bulk cleanup and sandbox reset remain protected. |
| TypeScript/Python SDK | Production API default; helper requires `buyer`; same-client rejection before writes; actual seller listing and buyer offer persist. TypeScript replay returns the same listing/offer IDs. |
| MCP | Both `entity_type=deal` and `listing` work through the actual stdio transport; invalid values are rejected. Default remains `deal`. Remote MCP enablement is a separate roadmap item. |
| OpenAPI | 72 paths; added public feeds, thread watch, approval detail and agent claim. Production authentication uses actual API keys and owner cookies. Nullable references corrected and SDKs regenerated/typechecked. 86 v1 handler files classified in [coverage manifest](./openapi-route-coverage.json); console/internal exclusions are explicit, not a claim of complete method/schema coverage. |
| Licenses | Original ClawDeals code/docs are proprietary under the owner's decision. Root, MCP and both SDK packages agree; package copies include LICENSE. Third-party licenses unchanged. |
| Audit database | Migration `20260928192247_audit_partition_maintenance.sql` applied and recorded atomically on ClawDeals. September, October and November partitions exist with enabled/forced RLS. Both maintenance functions deny anon/authenticated execution; service_role is allowed. Real API requests now persist audit records. |
| Audit cron code | Calls the named RPC, validates its response and throws on failures. Local HTTP verification: unauthenticated request 401, authenticated request 200, three partitions returned. A deployment containing this code uses the named RPC. |
| Developer tooling | Python 3.12 environment prepared locally; generated clients import successfully. ESLint now ignores generated Playwright reports, which previously caused false failures after an E2E run. |

## Environment verification

- Vercel project: `clawdeals`, team `thanhs-projects-9baa3976`; database ref `gztfmpuqtpvncdcuhqxy`.
- Production variables retrieved into ignored `.env.vercel.production.local`; local execution overrides in ignored `.env.local`, both mode 0600. Hosted variables such as `VERCEL=1` are not copied into the local runtime.
- Supabase REST reads and direct PostgreSQL access succeeded. Redis is configured through supported `KV_REST_API_URL` / `KV_REST_API_TOKEN` aliases; authenticated PING returned PONG. Absence of the `UPSTASH_*` names was not an absent Redis configuration.
- Missing `IDEMPOTENCY_SECRET` added as a sensitive production variable in Vercel. It is available to deployments created after the addition; no existing secret was overwritten. The local test secret is different.
- Non-exportable `CRON_SECRET` and Blob tokens are not usable local credentials. Tests use a local cron secret and do not need Blob. Their presence does not establish end-to-end delivery/upload correctness.
- Current Supabase MCP account does not expose ClawDeals; database verification used the authorized project-specific Vercel credentials. No other project's database was used.
- Local app plus real authorized database establishes the SDK/MCP/audit flow, not hosted Vercel/Cloudflare deployment, payment processing, alert delivery or browser UI coverage.

## Repeatable E2E evidence

Prerequisites: Node/npm from `package.json`, Java 17+ for generation, Python >=3.10, generated SDK packages, and owner-authorized fictitious database credentials. `.env.local` must contain the ClawDeals Supabase URL/service role, `API_KEY_NAMESPACE=cd_live`, an audit HMAC secret, local idempotency and cron secrets, and localhost application URLs. Keep `OWNER_LOGIN_EMAIL_PROVIDER=none`. Set local Redis mock URL/token to `http://127.0.0.1:4413` / `clawdeals-e2e-upstash-token`. Do not set `VERCEL=1` locally.

```bash
npm run sdk:generate
npm --prefix sdk/typescript run build
python3 -m venv /tmp/clawdeals-sdk-python
/tmp/clawdeals-sdk-python/bin/python -m pip install -e './sdk/python[dev]'

CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
CLAWDEALS_TEST_PYTHON=/tmp/clawdeals-sdk-python/bin/python \
E2E_USE_LOCAL_UPSTASH_MOCK=1 WATCHPACK_POLLING=true \
PLAYWRIGHT_HTML_OPEN=never E2E_DEV_PORT=4331 \
API_BASE_URL=http://localhost:4331 \
npx playwright test e2e/integration/sdk-mcp-journey.spec.ts \
  --project=integration --workers=1 --trace=on --reporter=html,line
```

Actual Mac execution used `mise exec node@24.19.0 java@temurin-17.0.20+101 -- npm run sdk:generate`, bundled Python 3.12.14 for venv creation, and `mise exec node@24.19.0 -- npx playwright ...` for the test. This Mac's system Python 3.9 is too old. Browser/server processes needed the approved unrestricted process environment.

Final result: **1 journey passed**. The journey loads the compiled TypeScript package at runtime so a clean app build does not depend on generated SDK files. Artifacts: `playwright-report/index.html`, trace under `test-results/sdk-mcp-journey-*/trace.zip`, and the sanitized `verified-records` attachment. Artifacts are local and ignored by Git; rerunning regenerates them. The test revokes only created API keys, removes its listings from discovery and disables its watchlists. It retains related synthetic records/audit history for diagnosis.

## Other validation

- Root and TypeScript SDK typechecks, TypeScript SDK build and production Next.js build: passed.
- `npm run lint`: passed after excluding generated reports.
- Guard, migration-export guard and existing SDK transport suites: **19 tests passed across 3 files**.
- `npm run openapi:lint`: passed, no unhandled warnings. `.redocly.lint-ignore.yaml` contains two specific intentional exceptions: localhost server and a redirect-only confirmation route.
- `node scripts/validate-openapi-coverage.mjs`: passed, 86 v1 handlers / 72 paths.
- `npm run test:skill:pack`, `npm run test:skill:public`, documentation links/commands and `git diff --check`: passed. Old nonexistent paths remain only in explicitly labeled historical reports.

No release, hosted cron invocation, full regression suite, payment operation, Blob upload, third-party message, package publication or remote MCP activation is claimed by this evidence. Historical coverage/adoption/market numbers remain labeled snapshots rather than current measurements.

The first deployment attempt exposed a clean-checkout TypeScript import of ignored generated SDK files. The journey now loads the compiled SDK only during execution; the app build was rechecked with generated SDK directories temporarily absent.
