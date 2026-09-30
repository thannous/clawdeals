# Local Supabase Development Workflow

Updated 2026-09-28. Optional local backend setup; a prerequisite only for tests/features that need this stack. See [current environment policy](./release-environments.md).

## Goal
Run deterministic sandbox fixtures locally when needed. This is not a mandatory staging gate for ordinary development or deployment.

## Prerequisites
- Docker installed and running.
- Supabase CLI installed (`supabase --version`).

## Start Local Stack

```bash
supabase start
```

Get local credentials:

```bash
supabase status --output env
```

## Required Local Environment Values

Use local values in `.env.local`:
- `SUPABASE_URL=http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase status>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>`

## Run App And Tests

Start app:

```bash
npm run dev
```

Run integration suite:

```bash
npm run test:integration
```

Run smoke script:

```bash
npm run test:smoke
```

Notes:
- `npm run test:smoke` auto-loads `.env.local` before validation.
- `npm run test:integration` keeps `PW_WEB_SERVER_MODE=prod` and enables a test-only local bridge for legacy `x-owner-id`/`x-agent-id` headers by default. For tests of real cookie sessions, set `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS=0` on the test command to disable that bridge. Development mode always accepts the legacy local headers, so use the production server mode for this check.

Quick preflight:

```bash
npm run test:integration -- --list
```

## Browser and runtime setup

Use the Node/npm versions in `package.json` and `.nvmrc`. On a machine with mise, `mise exec node@24.19.0 -- npm run dev` selects the repository's Node version without changing the global shell.

Install the matching Chromium binary once with `npx playwright install chromium --only-shell`. If macOS denies Chromium's MachPort bootstrap, run the approved browser process outside the restricted filesystem sandbox. If Watchpack reports `EMFILE`, retry with `WATCHPACK_POLLING=true` rather than changing app code.

Playwright starts a local server by default; `E2E_DEV_PORT` selects its port. Some integration suites also need Redis: the optional `E2E_USE_LOCAL_UPSTASH_MOCK=1` starts the repository's REST mock. Check fixture needs for the selected suite.

## Current guard behavior

Playwright and smoke scripts reject production by default. The explicit project-scoped development opt-in and its limits are documented in [release-environments.md](./release-environments.md). Sandbox reset endpoints remain restricted to a non-production backend.

## Stop Local Stack

```bash
supabase stop
```

## Remote Validation
- The former remote staging project is retired. Use the current environment policy to select an authorized target.
- See `docs/release-environments.md` and `docs/release-staging-to-prod.md`.
