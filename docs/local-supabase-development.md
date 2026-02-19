# Local Supabase Development Workflow

Effective date: February 17, 2026.

## Goal
- Keep local development and integration tests isolated from production.
- Use local Supabase as the default target.

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

Quick preflight:

```bash
npm run test:integration -- --list
```

## Safety Rules
- Never run integration/smoke/E2E with production Supabase (`gztfmpuqtpvncdcuhqxy`).
- Guardrail checks in Playwright/smoke/integration must fail closed on production target detection.

## Stop Local Stack

```bash
supabase stop
```

## Remote Validation
- Use staging only for remote validation and release checks.
- See `docs/release-environments.md` and `docs/release-staging-to-prod.md`.
