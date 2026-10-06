# Historical TesterArmy qualification snapshots

These are dated observations at their recorded sources. They are not the current result or current runner instructions. Output overrides below describe the old entry; the maintained entry reserves a new directory and refuses reuse.

## Upgrade qualification — e2e 0.18.0, 2026-10-06

Node 24.19.0, `@e2e-dev/web` 0.13.0 and Playwright Core 1.63.0 passed the existing journeys below. The TypeScript config and all 26 historical files collected with the new oxc loader; no config, runner, preload, fixture, assertion or legacy gate needed an adaptation.

| Campaign | Result | Report |
| --- | --- | --- |
| Real password visibility pilot, desktop | 1/1 | `.e2e/validation/e2e018-pilot-v2/report.json` |
| Local public desktop/mobile, CI mode, backend credentials empty | 14/14 | `.e2e/validation/e2e018-public-ci/report.json` |
| Historical desktop UI contracts, CI mode | 181/181 | `.e2e/historical/1791298485458-36805/report.json` |
| Canonical production public desktop/mobile | 10/10 | `.e2e/validation/e2e018-production-public/report.json` |

Every green campaign has zero skips, retries and model calls, with reports and browser traces retained. Typecheck, lint, dependency peers and diff whitespace passed. These local runs qualified the dependency/lock change on source `4e88377` with the upgrade diff present; recorded input hashes identify that candidate. They do not claim a hosted CI run or deployment of the upgrade. The first pilot's macOS sandbox Chromium launch failure remains separately under `.e2e/validation/e2e018-pilot/`; the same test passed outside that sandbox without changing its body. Older production and migration failures remain retained.

Exact reruns (start from the qualified commit and keep every output directory distinct):

```bash
CI=1 TESTERARMY_AI=0 E2E_DEV_PORT=4515 \
SUPABASE_URL= NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= NEXT_PUBLIC_SUPABASE_ANON_KEY= \
UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= \
E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 NEXT_TELEMETRY_DISABLED=1 \
PARITY_OUTPUT=.e2e/validation/e2e018-public-ci-rerun \
  mise exec node@24.19.0 -- npm run test:testerarmy

CI=1 TESTERARMY_AI=0 E2E_DEV_PORT=4515 \
SUPABASE_URL= NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= NEXT_PUBLIC_SUPABASE_ANON_KEY= \
UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= \
E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 NEXT_TELEMETRY_DISABLED=1 \
  mise exec node@24.19.0 -- node e2e/testerarmy/run-historical.mjs run

TESTERARMY_PRODUCTION_PUBLIC=1 TESTERARMY_AI=0 E2E_BASE_URL=https://app.clawdeals.com \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 NEXT_TELEMETRY_DISABLED=1 \
PARITY_OUTPUT=.e2e/validation/e2e018-production-public-rerun \
  mise exec node@24.19.0 -- npm run test:testerarmy
```

The local suites start and stop their own app on port 4515. Production attaches only to the canonical app URL and preserves the existing GET/HEAD-only network guard. Historical tests keep their mock contracts and cannot qualify database durability. Jev support is documented above; its optional executor is not installed or activated.

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
