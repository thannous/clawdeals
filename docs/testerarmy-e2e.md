# TesterArmy browser tests

ClawDeals uses [tester-army/e2e](https://github.com/tester-army/e2e) alongside its existing Playwright UI and integration suites. `e2e` 0.18.0 and `@e2e-dev/web` 0.13.0 are pinned development dependencies. The engine requires `e2e >=0.18.0 <1` and pins `playwright-core` 1.63.0 itself; the retained Playwright suites stay on 1.63.0.

The [official 0.18.0 release](https://github.com/tester-army/e2e/releases/tag/e2e%400.18.0) requires Node `^22.22.3 || >=24.8.0`; use the repository's Node 24.19.0. Its TypeScript loader uses oxc and Node's `module.registerHooks` instead of tsx. TypeScript config/tests remain ESM in this CommonJS project, with extensionless TypeScript imports and the nearest tsconfig respected. Existing historical entry, matcher preload, fixtures, guards, assertions and CI commands remain in place.

Before writing or running these tests, read `node_modules/e2e/skills/e2e/SKILL.md` and the relevant reference, or use `npx e2e guide setup`, `npx e2e guide writing-tests` and `npx e2e guide running`. The full versioned documentation is under `node_modules/e2e/docs/`.

## Current contracts and proportional evidence

The pinned versions describe the current installation, not a permanent ceiling.
Within authorized work, verify compatible peers and the candidate's installed
loader/API documentation, then adopt a successful representative journey with
its applicable checks. Exact steps need no model or new provider.

Current functional requirements govern test expectations. Record the reason for
revising an obsolete expectation and preserve its historical result; keep relevant
uncovered assertions and required CI. Retain one canonical report, source/target
identity, exact rerun and useful failure media. Reference verified outputs instead
of copying or fully rehashing them at each review. Reused evidence remains labelled
as reuse. Documentation-only follow-ups need diff/link checks, not another browser
corpus or production campaign. See [operating policy](../AGENTS.md).

## Run the public journeys

Use the repository's Node 24.19.0/npm versions:

```bash
npm ci
npx playwright install chromium
npm run test:testerarmy:list
npm run test:testerarmy
```

`e2e.config.ts` selects the public journeys by default, the historical UI files through their dedicated entry, and the agent test only when AI mode is selected. The runner starts `next dev --webpack` on `http://localhost:4318`, waits for readiness, shares the server between targets and stops it afterward. `E2E_DEV_PORT` changes the port. A supplied `E2E_BASE_URL` attaches to an existing server instead. Stop an app occupying the default port or choose another port; the runner does not silently reuse it.

The original navigation journeys run on Chromium at 1280×720 and 390×844:

- Homepage → listings through the actual CTA.
- English → French → English, using each viewport's language controls.
- Reveal a password field and hide it again, without submitting a login.
- French 404 → French listings through the recovery link.

No account or seeded listing is required. These journeys verify navigation and hydrated controls; they do not qualify database persistence, transactions or authentication. Those remain covered by the existing integration suites. `npm run test:e2e`, `test:ui` and `test:integration` retain their Playwright runner.

The configuration loads `.env.testerarmy.local`, then `.env.local`, without overwriting shell variables. Next.js also loads its normal local environment. The configuration passes selected database/Redis variables to the child app so shell overrides select the same backend the target guard checks. Follow [local setup](./local-supabase-development.md) when using the local backend.

## Select an authorized target

The existing project-scoped target guard also protects TesterArmy. The actual `.env.local` backend matters even when the browser opens localhost. If it targets the owner-approved disposable ClawDeals production database, use:

```bash
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
  npm run test:testerarmy
```

For the explicit public production selection:

```bash
TESTERARMY_PRODUCTION_PUBLIC=1 TESTERARMY_AI=0 \
E2E_BASE_URL=https://app.clawdeals.com \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/production-public-UNIQUE \
  npm run test:testerarmy
```

The same flag is needed for `test:testerarmy:list`, AI tests and MCP when their configured backend is production. Do not set it in Vercel. Production remains an explicitly labelled production target in the report. See [environment policy](./release-environments.md) for the permission and its limits.

### Two canonical production surfaces

`app.clawdeals.com/` redirects to `/start` (Connect); the SEO landing and
public Browse live on `clawdeals.com`. The dedicated production selection
runs only `e2e/testerarmy/production/`, on desktop and mobile:

- App root → exact `/start`, method tabs and their visible panels, without generating a key.
- App header EN → FR → reload → EN, using its actual banner controls and exact app URLs.
- Marketing homepage → Browse through the real CTA, with hydrated toolbar/search and no Browse error.
- Marketing EN → FR → EN, preserving the canonical marketing host.
- App French missing page → marketing 404 → French Browse through the single recovery link scoped to `main`.

It requires the exact app base URL above plus the existing disposable-production
opt-in, and rejects AI/historical mode combinations. Every destination assertion
uses an absolute canonical URL, so a correct path on a different host fails.
Public GET/HEAD requests on the two canonical origins reach production without
API mocks. All mutations, including acquisition telemetry POSTs, and external
requests are aborted before the first app open. Service workers are blocked.
The guard remains active until the runner closes the isolated context.
Each attempt saves its final screenshot, browser trace, public Next build ID
and refused request paths; no request bodies or credentials are recorded.
The canonical entry reserves a fresh `PARITY_OUTPUT` and keeps supplemental `request-guards/` JSON, the report and logs in that same directory. A supplied path must be new and inside `.e2e/`; reuse and symlink parents are refused.
There is no Generate, login submission, payment, demo navigation or real send.

The default local public suite and the historical entry remain exclusive of
these files. Their assertions and backend contracts are unchanged. This public
selection proves deployed navigation/controls and public reads, not authenticated
writes, notifications, transaction durability or server authorization.

The earlier production run `delivered-main-production` remains a separate red
campaign: **8/14 passed, 6 failed**. The local landing and navbar expectations
opened app Connect instead; the French 404 recovery matched both main and footer
links. Its eight passes comprise six mocked client controls and two password
visibility cases. They do not establish backend qualification. The red report,
screenshots and traces are retained, and none of those local assertions is
weakened to make the campaign green.

The retired `sandbox.clawdeals.com` demonstration is unavailable. The unsupported hero and Connect demo actions are removed. The catalogue notice links to the real public Browse route in the active locale; it promises no synthetic demonstration. The new local catalogue journey uses the existing identified public-listings client seam only, covers the empty state, Browse and browser return, and does not qualify production catalogue data. Production keeps real GET/HEAD requests.

## Enable agent actions

`npm run test:testerarmy:ai` selects `browse.agent.e2e.ts`, on both viewports. The agent opens the public marketplace and searches for `bicycle`; exact URL and field assertions verify each goal. These goals never submit a login, purchase or seller message. The model needs image and tool-call support, as required by the built-in TesterArmy agent. AI mode does not run in CI by default.

For a ChatGPT subscription, authenticate explicitly and inspect the available model IDs:

```bash
npx e2e login openai
npx e2e models openai
```

Then create the ignored `.env.testerarmy.local`:

```dotenv
TESTERARMY_PROVIDER=chatgpt
TESTERARMY_MODEL=gpt-6-luna
```

Replace the model with an ID available to the account if necessary. The subscription provider defaults to `gpt-6-luna` when no model is set. Run:

```bash
npm run test:testerarmy:ai
```

Add the disposable-production flag when the selected backend needs it. A missing subscription login fails explicitly; this setup does not import the Codex app's credentials or perform an automatic login.

An OpenAI API key is also supported:

```dotenv
TESTERARMY_PROVIDER=openai
TESTERARMY_MODEL=your-vision-and-tool-capable-model
OPENAI_API_KEY=your-key
```

For a compatible or local endpoint:

```dotenv
TESTERARMY_PROVIDER=openai-compatible
TESTERARMY_MODEL=your-vision-and-tool-capable-model
TESTERARMY_MODEL_BASE_URL=http://127.0.0.1:11434/v1
# TESTERARMY_MODEL_API_KEY=your-key-if-required
```

Keep secrets in the ignored local file or shell. A text-only Cerebras model used by the separate buyer agent is not sufficient for this built-in browser agent's image observations.

Verified `agent.act` steps may replay from `.e2e/cache/`; assertions still run. Add `--no-cache` to the AI command to qualify a live model run.

### Decision models, including Jev

The shipped 0.18.0 [decision-model guide](https://e2e.tester.army/docs/decision-models) documents the optional `@e2e-dev/decision` executor. It chooses bounded actions from the semantic tree using a decision model, such as `typeSafeAi.decisionModel('jev-latest')`, rather than generating selectors or URLs. A separate text model supplies field values and the judgment tier. The runner still authorizes actions and applies its budgets; this executor has no vision and does not offer drag, upload or hover.

This is documented support, with no live Jev qualification in this project. Enabling it later requires explicit provider configuration, `@e2e-dev/decision`, a decision provider, a text provider and `ai ^7.0.128` (within 7.x). This is the optional executor's peer requirement; `e2e` 0.18.0 itself requires `ai ^7.0.0`, which the current 7.0.107 satisfies. The existing providers remain unchanged. No decision package, provider credential, executor, budget or model call is added by the upgrade; default and CI journeys remain exact and model-free.

## Reports, CI and MCP

The maintained `npm run test:testerarmy` and historical entry reserve one new directory per invocation: `.e2e/runs/<selection>/<timestamp>-<uuid>`, or a fresh explicit `PARITY_OUTPUT`. The AI npm entry uses the same reservation without changing providers or budgets; it is excluded from public bundles. Discovery writes no report or app log. The raw SDK/MCP entry is an exploration interface, not this guarded qualification entry.

Reports, JUnit, Markdown, SDK artifacts, `runner.log`, `logs/app.log`, `command.json` and `completion.json` share the reserved directory. The receipts record exact arguments, source HEAD/dirty state, input SHA256 before and after, the primary exit/signal and any log failure. Inputs are checked in memory; a log/receipt failure makes an otherwise successful command fail, and does not replace the original failing exit. The historical fixture independently attempts screenshot, attachment index and structured error capture: original error object/stack survives a failing write. A successful body with collection failure stays red.

To save Actions minutes, CI runs the public journeys at the end of its single `test-ci` job (15-minute budget), once lint, contracts and unit tests have passed. Deterministic evidence controls precede a 5-minute public step (about 1 minute observed), leaving time for teardown, packaging and upload. The complete historical corpus runs in the separate `Historical browser corpus` workflow (`.github/workflows/historical-corpus.yml`), weekly and on manual dispatch, with a 15-minute step in a 20-minute job; it skips a commit that already passed it, and a production deployment waits for its success on the deployed SHA ([hosting](./hosting-cloudflare-vercel.md#current-development-topology-2026-09-28)). When a branch changes the historical suites, dispatch it there with `gh workflow run historical-corpus.yml --ref <branch>`. Actions, assertions, test timeouts and zero retries are unchanged. Once the journeys have started, collection and uploads use `always()`. A forced termination, missing completion or skipped case is explicitly incomplete qualification, even if upload succeeds. The legacy commands are retained.

### Complete bounded public artifacts

`bundle.mjs` consolidates actual `report-1` identities `(runId, targetId, testId, agent, repeat, attemptId, attemptIndex)`. It records every discovered pair, selected flag, exclusion/skip, cleanup and secondary error. Its `contextKey` correlates the engine context owned by one attempt; it is not a new SDK context ID. Current Clawdeals journeys do not create additional contexts or serial groups; these would require explicit mapping. Titles alone are never the key.

Only exact model-free public/historical/production-public invocations are exportable. Agent runs, sessions, replay caches and `ai-trace.json` are excluded. Declared SDK artifacts are checked against size and SHA256; undeclared/missing media are not invented. No artifacts directory is required when no media exists. Wrong field types, duplicate identities, missing attempts, failed cleanup/steps, missing receipts, changed inputs or altered files prevent a green complete verdict. Complete evidence and passed journeys are separate fields, so a preserved red run remains red.

The file inventory is partitioned into at most four disjoint parts, each with at most 384 MiB of uncompressed payload and at most 480 MiB for its actual compressed archive plus index. An individual file or total part count above these limits fails explicitly; it is never dropped to meet a size limit. Every part carries the same complete manifest with all file sizes/digests, exact membership and run identities. The union must contain each inventoried file exactly once.

Both workflows upload **each part as a separate artifact**, named `testerarmy-browser-results-<run_id>-<run_attempt>-part-N`, plus `testerarmy-evidence-index-<run_id>-<run_attempt>`. It explicitly uses [`upload-artifact@v7` `archive: true`](https://github.com/actions/upload-artifact/blob/v7/action.yml) and `compression-level: 0`: each provider download remains a ZIP containing `evidence.tar.gz` and `manifest.json`. There is no combined upload of all parts. This preserves the existing ZIP download contract and leaves 32 MiB for the provider envelope below the 512 MiB read cap. `archive: false` would upload a single raw file and ignore `name`; it is deliberately not used here.

Before upload, creation round-trips the actual tar files: checks archive hashes, part-index equality, regular file types, safe membership, then extracts only into an owned temporary directory and rechecks every file byte/hash. Retrieve every listed artifact for the exact workflow run, retain the provider artifact IDs/ZIP hashes, inspect the downloaded format before extraction, then restore the part folders and common manifest to its recorded bundle path and rerun:

```sh
node e2e/testerarmy/bundle.mjs verify .e2e/ci/RUN_ID-RUN_ATTEMPT/bundle
```

For a local pair of fresh campaigns:

```sh
PARITY_OUTPUT=.e2e/validation/public-UNIQUE npm run test:testerarmy
PARITY_OUTPUT=.e2e/validation/historical-UNIQUE node e2e/testerarmy/run-historical.mjs run
node e2e/testerarmy/bundle.mjs create .e2e/validation/bundle-UNIQUE \
  .e2e/validation/public-UNIQUE .e2e/validation/historical-UNIQUE
```

The procedure and [parity matrix](./testerarmy-parity.json) describe maintained behavior. Each completed campaign has one external closeout manifest containing the current source/tree, exact rerun commands, selected/excluded identities, artifact/union hashes and deployment boundary. Never edit an earlier run or turn a PR result into a final-main result: compare the delivered tree and obtain the delivered commit's CI, historical-corpus and deployment evidence separately.

`npm run testerarmy:mcp` starts the framework's stdio MCP server with the desktop target selected. An MCP client can register this command to inspect the app; no user-level Codex configuration is modified by this setup.

The npm scripts disable TesterArmy usage telemetry. For direct `npx e2e` commands, set `E2E_TELEMETRY_DISABLED=1` to keep the same setting.

The exact suite also runs six client UI cases (three journeys on each viewport)
in `e2e/testerarmy/marketplace-controls.e2e.ts`: listing sort/search/filter reset
with exact request parameters and empty-state recovery, price-alert API error
recovery, and legacy sign-in link creation for the exact entered address. These
reuse the historical UI suites' synthetic client API seams. They do not qualify
SSR data, database durability, authorization, notifications, transactions or SDK
and MCP behavior; the existing backend and isolation contracts remain.
The listing toolbar's filter reset keeps the search query; clearing that query
is a separate visible action tested before checking recovery.

CI explicitly sets `TESTERARMY_AI=0`. The exact suite uses no replay cache and
zero retries, so a stale recording or a retry cannot conceal a failing public
journey. The optional AI command still requires its explicit provider opt-in.

## Historical UI parity

The [26-family parity matrix](./testerarmy-parity.json) maps 181 Desktop Chrome cases under
TesterArmy, retaining their request payload, filters, pagination, redaction,
confirmation, owner profile, device authorization and WebMCP assertions:

```sh
mise exec node@24.19.0 -- node e2e/testerarmy/run-historical.mjs list
mise exec node@24.19.0 -- node e2e/testerarmy/run-historical.mjs run
```

This is the single historical entry. It fixes the desktop target, uses the
existing local app and environment guard, enables the same WebMCP flag as the
old UI config, and scopes a matcher preload to the test CLI/workers. The app
receives the caller's original `NODE_OPTIONS` value or its original absence.
The default public desktop/mobile selection remains independent. CI runs the
public command on each PR and push to `main`; `historical-corpus.yml` runs this
historical command weekly and on dispatch. Each uploads its reports, JUnit,
screenshots and traces.

The browser engine's public `surfaceOf()` supplies Page/context APIs for the
historical bodies. TesterArmy owns attempts, context isolation, screenshots
and tracing; the Playwright package supplies exact matchers only. Relative
navigation and the two relative URL expectations resolve against the fixed
QA baseURL. Native dialogs use the engine's public dialog handler. Function
init scripts receive a lexical compiler helper required by the installed
TypeScript loader; mocks and registry expectations stay unchanged.

Identified synthetic client API fixtures retain priority over the network
guard. Read-only local requests follow the existing nonproduction guards;
all unmocked API mutations and external requests are aborted. This proves
client interactions and mocked contracts, including write confirmation and
idempotency headers. Database durability, RLS, authorization, SDK/MCP server
contracts and real financial actions remain in the retained backend suites.
No historical UI or integration test is removed by this migration. The 72 retained API/integration files are separate real backend contracts. A mocked UI pass is not backend durability, a pixel diff or a native/device qualification.

On 2026-10-06 the full suite passed 181/181 without skips, retries or models;
that dated campaign retains its historical output directories. Each attempt records
its final UI and retains the browser trace, and failed calibration runs are
preserved separately. Earlier loader/baseURL/dialog failures were adapter
failures; they were not app regressions.

## Dated qualification archives

[Setup and 0.18.0 upgrade observations](./archive/testerarmy-qualification-2026-10-06.md) retain their source-specific results and failures. Current results are recorded once in the campaign closeout manifest, not copied into this procedure.

## Local host routing

The owned local server sets the canonical APP_HOST and MARKETING_HOSTS explicitly.
This prevents a machine-local APP_HOST=localhost from redirecting homepage tests
to https://localhost/start without the test port. Hosted targets keep their own
server configuration and all backend target guards still apply.

## agent-device routing

`agent-device` is installed on the host with its official Codex skill. It is the
native driver used by `@e2e-dev/mobile` in projects with installed iOS/Android
apps. ClawDeals is a browser app: keep `@e2e-dev/web` and this project's existing
TesterArmy configuration. No native package or device target is added here.
Use `npm run testerarmy:mcp` for live browser exploration and locator discovery,
then save reproducible journeys in `e2e/testerarmy/`. Existing environment guards,
provider opt-ins and Playwright/CI coverage remain in force.
