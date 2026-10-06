# TesterArmy browser tests

ClawDeals uses [tester-army/e2e](https://github.com/tester-army/e2e) alongside its existing Playwright UI and integration suites. `e2e` 0.15.2 and `@e2e-dev/web` 0.11.1 are pinned; Playwright is aligned at 1.63.0 to satisfy the browser engine's peer dependency. These tools are development dependencies.

Before writing or running these tests, read `node_modules/e2e/skills/e2e/SKILL.md` and the relevant reference, or use `npx e2e guide setup`, `npx e2e guide writing-tests` and `npx e2e guide running`. The full versioned documentation is under `node_modules/e2e/docs/`.

## Run the public journeys

Use the repository's Node 24.19.0/npm versions:

```bash
npm ci
npx playwright install chromium
npm run test:testerarmy:list
npm run test:testerarmy
```

`e2e.config.ts` discovers only `e2e/testerarmy/**/*.e2e.ts`; it excludes the agent test unless AI mode is selected. The runner starts `next dev --webpack` on `http://localhost:4318`, waits for readiness, shares the server between targets and stops it afterward. `E2E_DEV_PORT` changes the port. A supplied `E2E_BASE_URL` attaches to an existing server instead. Stop an app occupying the default port or choose another port; the runner does not silently reuse it.

The four public journeys run on Chromium at 1280×720 and 390×844:

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

For the public production app:

```bash
E2E_BASE_URL=https://app.clawdeals.com \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
  npm run test:testerarmy
```

The same flag is needed for `test:testerarmy:list`, AI tests and MCP when their configured backend is production. Do not set it in Vercel. Production remains an explicitly labelled production target in the report. See [environment policy](./release-environments.md) for the permission and its limits.

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

## Reports, CI and MCP

Every run writes `.e2e/report.json`, `.e2e/junit.xml` and `.e2e/summary.md`. `trace: "on"` retains browser traces for successful and failed tests under `.e2e/artifacts/`; failures also produce screenshots and Markdown diagnostics. App output is in `.e2e/logs/app.log`. `.e2e/` is ignored; keep reports private when they contain app data. To preserve separate runs, append `--output .e2e/validation/<run-name>` before rerunning.

The `testerarmy` job in `.github/workflows/ci.yml` installs Chromium and runs the public navigation and client control cases against a fresh local app without model or database credentials. It uploads reports and browser artifacts for seven days, including after failures, and contributes to the aggregate `test-ci` result. It does not deploy the app or test the deployed revision.

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

## Setup validation — 2026-10-02

Verified on Node 24.19.0 with Chromium 153 / Playwright 1.63.0:

| Check | Result | Evidence |
| --- | --- | --- |
| Public journeys, local app and authorized ClawDeals backend | 8/8 passed, no skips | `.e2e/validation/local/report.json`, `summary.md`, eight browser traces |
| Public journeys, CI mode with database/Redis credentials empty | 8/8 passed, no skips | `.e2e/validation/ci-no-backend/report.json`, `summary.md`, eight browser traces |
| Existing landing, login and legacy deal UI suites | 9/9 passed | `.e2e/validation/playwright-compatibility/index.html`, traces under `.e2e/validation/playwright-artifacts/` |
| Target/config preflight | Six cases passed | Production without opt-in, foreign host, Vercel runtime, invalid port and unknown provider rejected; AI discovery selected two target/test pairs |
| MCP | Passed | Stdio handshake and discovery of `open_session`, `tools`, `call`, `close_session` |
| Typecheck, lint, CI YAML parsing and diff whitespace | Passed | Local commands |

No test account or seeded data is required for these runs. Browser navigation does not write marketplace data. The CI-mode run deliberately leaves the backend unavailable and qualifies public controls only. The AI journey was discovered and typechecked, but no live model run was performed because a provider/login has not been selected. The GitHub job is configured; no hosted CI run or deployment was triggered.

Exact local rerun using the installed temporary browser cache:

```bash
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clawdeals-testerarmy-browsers \
NEXT_TELEMETRY_DISABLED=1 \
mise exec node@24.19.0 -- npm run test:testerarmy -- --output .e2e/validation/local
```

To reproduce the CI-mode check without backend credentials:

```bash
CI=1 SUPABASE_URL= NEXT_PUBLIC_SUPABASE_URL= \
SUPABASE_SERVICE_ROLE_KEY= NEXT_PUBLIC_SUPABASE_ANON_KEY= \
UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= \
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clawdeals-testerarmy-browsers \
NEXT_TELEMETRY_DISABLED=1 \
mise exec node@24.19.0 -- npm run test:testerarmy -- --output .e2e/validation/ci-no-backend
```

Exact compatibility rerun:

```bash
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
E2E_DEV_PORT=4318 WATCHPACK_POLLING=true \
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clawdeals-testerarmy-browsers \
PLAYWRIGHT_HTML_REPORT=.e2e/validation/playwright-compatibility \
NEXT_TELEMETRY_DISABLED=1 \
mise exec node@24.19.0 -- npx playwright test \
  e2e/ui/landing.spec.ts e2e/ui/auth-login.spec.ts e2e/ui/deal-detail.spec.ts \
  --project=ui --workers=1 --trace=on --reporter=html,line \
  --output .e2e/validation/playwright-artifacts
```

If the temporary cache is gone, rerun `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/clawdeals-testerarmy-browsers npx playwright install chromium` with Node 24 first. macOS sandbox restrictions can prevent Chromium's MachPort bootstrap; these successful browser runs used an approved process outside that restricted sandbox.

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
