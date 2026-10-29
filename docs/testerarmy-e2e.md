# TesterArmy browser tests

ClawDeals uses `@e2e-dev/web` for new and affected browser journeys. Existing
Playwright suites retain their runner. Use the versions in [package.json](../package.json)
and read `node_modules/e2e/skills/e2e/SKILL.md` plus the relevant topic before
changing the tests or SDK calls. Current functional requirements and
[AGENTS.md](../AGENTS.md) govern expectations and proportional verification.

The pinned runner is `e2e` 0.21.3 with `@e2e-dev/web` 0.15.3, matching
Noctalia's web integration. The web engine and the retained Playwright suites
both use `playwright-core` 1.64.1, so the Chromium installation below serves
both. Use the repository's Node 24 runtime; native device tooling is not needed
for this browser application.

## Start and select a target

```sh
npm ci
npx playwright install chromium
npm run test:testerarmy:list
npm run test:testerarmy
```

The runner starts `next dev --webpack` at `http://localhost:4318`, waits for
readiness and closes it afterward. Set `E2E_DEV_PORT` for another port, or
`E2E_BASE_URL` to attach to an existing app. An occupied port is not silently reused.
The owned server sets canonical `APP_HOST`/`MARKETING_HOSTS` so local environment
values cannot redirect tests away from their port.

Configuration loads `.env.testerarmy.local`, then `.env.local`, without overriding
shell values. Selected database/Redis values are forwarded to the child app.
A localhost browser can still use a remote backend. Follow the
[environment policy](./release-environments.md) and [local setup](./local-supabase-development.md).
For the authorized disposable ClawDeals database, including discovery and MCP:

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
  npm run test:testerarmy
```

Never set that opt-in in Vercel or relabel production as sandbox. Fixtures and
credentials must match the selected target; the flag does not enable sandbox resets.
Commands below assume those prerequisites and a fresh `PARITY_OUTPUT` inside `.e2e/`.

| Need | Command or selection |
| --- | --- |
| Public desktop/mobile client journeys | `npm run test:testerarmy` |
| Mission client regressions | `npm run test:mission:client` |
| Real mission creation/readback | `npm run test:mission` |
| Complete local buyer/seller journey | `npm run test:commerce` |
| Deployed authenticated commerce | `npm run test:commerce:production` |
| Deployed public reads | `TESTERARMY_PRODUCTION_PUBLIC=1`, example below |
| Historical client corpus | `node e2e/testerarmy/run-historical.mjs run` |
| Optional browser agent | `npm run test:testerarmy:ai` |
| Existing Playwright suites | `npm run test:ui`, `npm run test:integration` |

Public, historical, mission, commerce and AI selections are exclusive.
Use `-- --target desktop` for a bounded npm-command pilot, or an exact spec path.
Default public journeys run desktop/mobile without accounts or model calls.
Their intercepted client contracts prove UI behavior, not authentication,
database persistence, notifications or transactions.

The API-key continuation contract is covered by
`e2e/testerarmy/keys-next-url.e2e.ts`. Run it with
`npm run test:testerarmy -- e2e/testerarmy/keys-next-url.e2e.ts --target desktop`.
It checks both continuation links and synthetic key generation/validation without
backend credentials. `/keys?next=` accepts canonical relative paths and HTTP(S)
URLs on `clawdeals.com`, its dot-delimited subdomains, or exact `localhost`
(including development ports). Lookalike hosts, protocol-relative paths,
backslashes, control characters, URL credentials and other schemes fall back
to `/mcp`.

## Smartphone journeys on a local backend

`TESTERARMY_PASSPORT_MISSIONS_LIVE=1` selects the connected smartphone mission
scenarios on desktop and mobile. It requires loopback app and Supabase URLs;
fixtures create synthetic local Auth users and exercise owner sessions, APIs,
PostgreSQL and matching queues. See [mission prerequisites and commands](smartphone-passport-missions.md#verification).

`TESTERARMY_COMPARISON_LIVE=1` selects the connected comparison journeys,
exclusively of other selections. Both app and Supabase must be loopback origins.
Fixtures own and remove their synthetic rows; the browser reads the real API.
Separate client cases simulate API failures. No authentication, messaging,
payments or model calls are part of this comparison suite. See the
[comparison recipe](smartphone-comparison.md#verification).

Both connected selections are excluded from the default public run. Passport
editor client coverage and proof boundaries are in the [passport guide](smartphone-passport.md#validation-and-release).

## Verify the real first purchase mission

Prerequisites: matching browser/API origin, `SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only
`SUPABASE_SERVICE_ROLE_KEY`, and working Redis for rate limits/idempotency.
The wrapper generates the synthetic password in memory; do not export one.
It creates confirmed synthetic users without email, performs real password login
and the owner-session bridge, creates missions and reads them back.
The listing scenario also creates its own seller/listing.

```sh
E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/mission-UNIQUE \
  npm run test:mission
```

For local Redis emulation, run `scripts/mock-upstash-redis-rest.mjs` on port 4413,
configure app and runner with its URL/token, and set
`TESTERARMY_REDIS_FIXTURE=local-mock`. This qualifies real Auth/database/API behavior
with simulated Redis, not hosted Redis durability. Missing Redis correctly fails
writes; keep middleware protections enabled.

Only same-origin reads, sign-in, session bridging and mission creation are allowed.
Offers, seller messages, payments and other browser writes are blocked.
Cleanup deletes only the attempt's identities/rows; incomplete cleanup fails the run.
Private `mission-fixtures/` receipts keep safe identities and cleanup summaries.
Network traces are disabled and screenshots suppressed after password entry.

Client-only drafts, account changes, quota/lost-response recovery, paused status
and price-unit regressions use intercepted API seams:

```sh
E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/mission-client-UNIQUE \
  npm run test:mission:client
```

For a focused replay replace the command with
`npm run test:testerarmy -- e2e/testerarmy/mission-recovery.e2e.ts` or
`npm run test:testerarmy -- e2e/testerarmy/webmcp-mission-regression.e2e.ts`.
Keep local public/API URLs aligned. These cases need no account fixture; unmocked
mutations and external requests are blocked. Modeled `SubmitEvent.respondWith`
and recovery contracts do not qualify native WebMCP or real backend persistence.

## Verify a complete buyer–seller transaction

The private commerce suite uses real password sessions, agent API calls and
exact browser steps, without a model. It creates two synthetic users with silent
notifications, owned agents (including a suspended-selection counterexample),
keys and a listing. Before publication, the real matcher must find no matching
watchlist owned by another agent. That check is a snapshot, not a concurrency lock.

The journey negotiates an offer above the buyer's ceiling, edits its approval,
checks recovery after owner-session expiration, accepts, obtains both owners'
contact-sharing consent, and confirms completion from both agents.
No payment, email, SMS or third-party message is sent.

```sh
E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_REDIS_FIXTURE=local-mock \
UPSTASH_REDIS_REST_URL=http://127.0.0.1:4413 \
UPSTASH_REDIS_REST_TOKEN=clawdeals-e2e-upstash-token \
PARITY_OUTPUT=.e2e/validation/commerce-UNIQUE \
  npm run test:commerce
```

Start the app with the same Redis fixture and origin; Supabase prerequisites
match the mission suite. The wrapper owns ephemeral passwords.
Cleanup verifies the fixture's business graph before deleting owned rows,
Auth users and Redis keys/streams; another party's records stop cascading cleanup.
Shared ops streams and expiring rate counters remain untouched. Cleanup failures
remain distinct from the primary journey failure and fail qualification.

For the deployed Vercel/Auth/Postgres/Redis path:

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/commerce-production-UNIQUE \
  npm run test:commerce:production
```

This wrapper accepts only `https://app.clawdeals.com`, rejects hosted Vercel
execution, and selects remote `UPSTASH_*` credentials or `KV_REST_API_*` aliases
in memory. It never rewrites local environment files. Reads may follow the
marketing origin; mutations remain restricted to fixture entities. Receipts
retain build/SHA and an authenticated deployed Redis check. Cookie journeys
exchange a real Supabase token through the actual owner-session bridge.
All commerce evidence stays private; video/network traces are off, and cookie
journeys may capture synthetic-account screens without passwords.

## Check the deployed public surfaces

```sh
TESTERARMY_PRODUCTION_PUBLIC=1 TESTERARMY_AI=0 \
E2E_BASE_URL=https://app.clawdeals.com \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/production-public-UNIQUE \
  npm run test:testerarmy
```

Only `e2e/testerarmy/production/` runs, on both viewports. It checks app root
to `/start`, method tabs, language persistence, marketing Browse and localized
404 recovery with absolute canonical URLs. AI/historical combinations are refused.
Real GET/HEAD requests reach the app and marketing origins; all mutations
(including telemetry), external requests and service workers are blocked.
The guard persists until context closure. Each attempt records final screenshot,
trace, public Next build ID and refused paths without bodies or credentials.
This proves deployed navigation/public reads, not authenticated writes.

## Verify the SDK and MCP journey

This Playwright integration uses the real TypeScript/Python clients and MCP stdio
transport. Prerequisites: repository Node/npm, Java 17+ for client generation,
Python >=3.10, generated SDKs and authorized backend credentials.
Configure `.env.local` with Supabase URL/service role, `API_KEY_NAMESPACE=cd_live`
for the opted-in ClawDeals backend, audit HMAC, local idempotency/cron secrets,
localhost public/API URLs, and `OWNER_LOGIN_EMAIL_PROVIDER=none`.
Use local Redis URL/token `http://127.0.0.1:4413` / `clawdeals-e2e-upstash-token`.
Never copy `VERCEL=1` into the local environment.

```sh
npm run sdk:generate
npm --prefix sdk/typescript run build
python3 -m venv outputs/sdk-python
outputs/sdk-python/bin/python -m pip install -e './sdk/python[dev]'

CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
CLAWDEALS_TEST_PYTHON="$PWD/outputs/sdk-python/bin/python" \
E2E_USE_LOCAL_UPSTASH_MOCK=1 WATCHPACK_POLLING=true \
PLAYWRIGHT_HTML_OPEN=never E2E_DEV_PORT=4331 \
API_BASE_URL=http://localhost:4331 \
  npx playwright test e2e/integration/sdk-mcp-journey.spec.ts \
    --project=integration --workers=1 --trace=on --reporter=html,line
```

The journey creates distinct seller/buyer agents and tests writes, idempotency
and MCP matches. Teardown revokes its keys, hides its listings and disables its
watchlists; related synthetic business/audit records remain for diagnosis.
Keep the Playwright report, trace and sanitized `verified-records` attachment
private. A local pass does not establish hosted UI, payments or alert delivery.

## Optional agent actions and exploration

`npm run test:testerarmy:ai` selects a marketplace search with exact outcome
assertions; it does not submit login, purchase or seller messages. Use an already
authorized provider with image/tool support. For ChatGPT, explicitly authenticate
with `npx e2e login openai` and inspect `npx e2e models openai`.
Set ignored `.env.testerarmy.local`:

```dotenv
TESTERARMY_PROVIDER=chatgpt
TESTERARMY_MODEL=gpt-6-luna
```

Then run `npm run test:testerarmy:ai` with the backend opt-in if required.
Missing login fails; Codex credentials are not imported. `openai` requires
`OPENAI_API_KEY` and `TESTERARMY_MODEL`; `openai-compatible` also requires
`TESTERARMY_MODEL_BASE_URL`, with optional `TESTERARMY_MODEL_API_KEY`.
A text-only buyer model cannot provide browser image observations.
AI actions can replay from `.e2e/cache/`; add `--no-cache` for a live model run.

`npm run testerarmy:mcp` opens the desktop exploration interface.
`npm run testerarmy:dogfood` attaches to `E2E_BASE_URL` and opens sequential
French/Spanish mobile sessions with real catalogue reads and storage-isolation
assertions. Supply a fresh `PARITY_OUTPUT` and backend opt-in as above.
It closes owned sessions/host, fails cleanup errors, and records `host-result.json`
plus SDK traces. This exploration receipt is not a CLI qualification report.
Reproduce defects through the maintained runner. Npm entries disable usage
telemetry; direct SDK/CLI commands require `E2E_TELEMETRY_DISABLED=1` for parity.

## Historical UI parity and CI

The [parity matrix](./testerarmy-parity.json) maps retained client assertions:

```sh
node e2e/testerarmy/run-historical.mjs list
node e2e/testerarmy/run-historical.mjs run
```

This entry fixes desktop, uses the local app/backend guard, preserves WebMCP
fixtures and scopes matcher setup to its CLI/workers. TesterArmy owns context
isolation/traces; Playwright provides matchers. Synthetic API routes retain
priority, while unmocked API mutations and external requests are blocked.
These are client contracts; retained integration suites cover real persistence,
RLS, authorization, SDK/MCP and backend behavior.

Both CI workflows are manual dispatch only. `ci.yml` runs contracts then public
desktop/mobile in separate app processes, with loopback auth configuration and
intercepted responses; local ChatGPT UI cases require explicit opt-in.
`historical-corpus.yml` runs the historical entry and skips a previously passed
commit. For affected historical changes, run locally or dispatch
`gh workflow run historical-corpus.yml --ref <branch>`.
The [release gate](./hosting-cloudflare-vercel.md#current-development-topology-2026-09-28)
requires the historical corpus on the published SHA. Exact suites use zero
retries, no replay cache and `TESTERARMY_AI=0`. Incomplete/skipped/terminated
campaigns stay incomplete even if artifact upload succeeds.

## Reports and public artifact bundles

The maintained runner reserves `.e2e/runs/<selection>/<timestamp>-<uuid>` or a
fresh explicit `PARITY_OUTPUT`; reuse and symlink parents are refused. Discovery
writes no report/app log. Reports, logs, SDK artifacts, `command.json` and
`completion.json` share the directory. Receipts identify arguments, source/dirty
state, effective versions, input hashes and primary exit/signal. Missing receipts,
changed inputs or collection/cleanup errors prevent complete qualification;
secondary errors never replace the original failure.

Current SDK media is under `results/`, with each public/historical result's
`trace.md`; the bundler also validates the older 0.18 artifact/attempt-ZIP layout.
Keep one canonical result with target, source, exact rerun and useful failure
media. Label reused evidence; older results and upgrade notes remain in Git
history, not in the active procedure.

Only model-free public/historical/production-public runs are exportable.
Mission, commerce, AI, sessions, replay caches and `ai-trace.json` stay private.
The bundler validates actual run/attempt identities, selected/excluded cases,
declared media, digests and cleanup; preserved failures remain failures.
It emits at most four disjoint parts (384 MiB payload, 480 MiB archive/index each),
failing rather than dropping oversized files. Every part includes the manifest.

```sh
PARITY_OUTPUT=.e2e/validation/public-UNIQUE npm run test:testerarmy
PARITY_OUTPUT=.e2e/validation/historical-UNIQUE node e2e/testerarmy/run-historical.mjs run
node e2e/testerarmy/bundle.mjs create .e2e/validation/bundle-UNIQUE \
  .e2e/validation/public-UNIQUE .e2e/validation/historical-UNIQUE
node e2e/testerarmy/bundle.mjs verify .e2e/validation/bundle-UNIQUE
```

CI uploads each part separately as `testerarmy-browser-results-<run_id>-<attempt>-part-N`
plus an evidence index, using archive ZIPs containing `evidence.tar.gz` and
`manifest.json`. Retrieve every indexed part for that workflow run, retain artifact
IDs/hashes, inspect the format, restore the recorded bundle path and run `bundle.mjs verify`.
Creation already validates archive membership/types and round-trips the file hashes.
Keep one campaign closeout manifest; PR evidence does not become final-main or
deployment evidence merely because it was preserved.

## agent-device routing

ClawDeals has no native target. Use `@e2e-dev/web` and `npm run testerarmy:mcp`
for this app; `agent-device`/`@e2e-dev/mobile` belong to projects with installed
native apps. Save reproducible browser journeys under `e2e/testerarmy/`.
