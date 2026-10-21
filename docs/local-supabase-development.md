# Local Supabase Development Workflow

Updated 2026-10-19. Optional local backend setup; a prerequisite only for tests/features that need this stack. See [current environment policy](./release-environments.md).

## Goal
Run deterministic sandbox fixtures locally when needed. This is not a mandatory staging gate for ordinary development or deployment.

## Prerequisites
Local Supabase runs on the Supabase CLI native runtime: every service is a process on the host, with no Docker. Docker is not a supported path for this repository.

- Linux on `amd64` or `arm64` with glibc 2.35 or later (Ubuntu 22.04 or later; check with `ldd --version`), or macOS 14 or later on Apple silicon. Windows and Intel Macs are not supported.
- Supabase CLI v2.121.0 or later (`supabase --version`). The native runtime needs v2.119.0; v2.121.0 is needed for native `pg_cron` jobs (this repository schedules one) and to apply port changes to a stopped local project.
- `tar` on the host and, on the first start, network access to the service archive hosts (`supabase/slim-services` GitHub releases, with `supabase-cli-artifacts.s3.us-east-1.amazonaws.com` as a fallback). Archives are cached in `~/.supabase/cache/stack`, shared by every local project on the machine.
- A non-root user: Postgres `initdb` cannot run as `root`. When you must run as `root` (a CI container), set `SUPABASE_NATIVE_POSTGRES_USER` to an existing non-root account.

`supabase/config.toml` sets `stack = true` under `[experimental]`, which routes `supabase start`, `status`, `stop` and the local `db`, `migration`, `test` and `gen` commands to the experimental stack. Its flags and output can change between CLI releases.

## Start Local Stack

```bash
supabase start --runtime native
```

The first start downloads the enabled services; add `--preparation on-demand` to download each one on its first request instead. Postgres starts at once, applies `supabase/migrations` and `supabase/seed.sql`; the other services start on their first request and stop again after 60 s idle (Studio after 5 minutes). Add `--eager` to start everything up front. The runtime is fixed when the local project is created; later starts reuse it.

Each project root and git branch (so each git worktree) gets its own local project, ports and data. `config.toml` sets no fixed ports, so the CLI assigns them from 20000 to 32767 and keeps them stable across restarts. Do not assume `54321`: read the ports with

```bash
supabase status
```

## Required Local Environment Values

Export the local values for `.env.local`:

```bash
supabase status --env --override-name API_URL=SUPABASE_URL,SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY,ANON_KEY=NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Then set `NEXT_PUBLIC_SUPABASE_URL` to the same value as `SUPABASE_URL`. `DB_URL` in the same output is the local database URL (password `postgres`). The legacy `supabase status --output env` (`-o env`) is not available with the stack.

## Reset, Stop and Remove

```bash
supabase db reset           # re-apply migrations and seed on this branch's local project
supabase stop               # stop it, keeping data and ports
supabase stack destroy --yes  # delete its data and free its ports
supabase stack list         # every local project on the machine
```

## Database Grant Check

`npm run check:db-grants` starts a native stack (or reuses this checkout's running one), runs `supabase db reset`, reads `pg_catalog`, then stops and destroys the stack. It fails when a public table or partition lacks RLS or an explicit `service_role` grant, when `anon` or `authenticated` hold a public table privilege not listed in `supabase/db-grants-allowlist.json` (each entry needs a reason), or when a SECURITY DEFINER function in public is executable by `PUBLIC` or `anon`. It reports public views and SECURITY DEFINER functions `authenticated` can execute. Column-level grants count. A reset that leaves no public table, or a teardown that fails, also fails the check. `npm run verify:pr` runs it when `supabase/**`, `package.json` or the check changes. Because it destroys the stack, stop any local work on it first.

## Limits

- `config.toml` settings that the stack does not support make `supabase start` fail with a message naming the setting: `api.tls` enabled, Analytics backends other than Postgres, custom Auth email templates with `content_path`, Storage Analytics and vector buckets, a custom `edge_runtime.deno_version`, `db.major_version` other than 15 or 17, and the `experimental.s3_*` OrioleDB settings. None is enabled here.
- Database commands do not accept `--stack`; they target the current branch's default local project. Switching branches or moving the directory starts a different local project with its own data.
- Native local projects share the host process table and file locks; run one per worktree and stop it when done.
- If Postgres is slow to become ready on a cold start, raise `health_timeout` under `[db]`.
- A native `pg_cron` job runs in a background worker, so its body cannot contain `BEGIN` or `COMMIT`.

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

## Remote Validation
- The former remote staging project is retired. Use the current environment policy to select an authorized target.
- See `docs/release-environments.md` and `docs/release-staging-to-prod.md`.
