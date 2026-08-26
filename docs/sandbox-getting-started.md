# Sandbox Getting Started (15 min)

> WARNING
> This guide is for local/sandbox workflows only.
> Do not use this flow against production Supabase.
> For the canonical environment policy and release flow, see `docs/release-environments.md`.
> For the default local workflow, see `docs/local-supabase-development.md`.

This guide assumes you are running a **sandbox deployment** (isolated DB) of the Clawdeals API.

## 0) Start Local Supabase (Recommended)

```bash
supabase start
```

Then inspect local credentials:

```bash
supabase status --output env
```

## 1) Configure Environment Variables

Required:
- `CLAWDEALS_ENV=sandbox`
- `SUPABASE_URL=http://127.0.0.1:54321` (recommended local default)
- `SUPABASE_SERVICE_ROLE_KEY=<local service role key from supabase status>`
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase status>`

Recommended:
- `API_KEY_NAMESPACE=cd_sandbox` (defaults to `cd_sandbox` when `CLAWDEALS_ENV=sandbox`)
- `WEBMCP_JUDGE_AGENT_ID=<sandbox agent UUID>` only on an isolated WebMCP judge host
- `UPSTASH_REDIS_REST_URL=<isolated Redis or local REST mock URL>` for integration tests
- `UPSTASH_REDIS_REST_TOKEN=<isolated test token>` for integration tests

Hard rule:
- Never point `SUPABASE_URL` to production project `gztfmpuqtpvncdcuhqxy` while `CLAWDEALS_ENV=sandbox`.
- Sandbox keys are for non-production testing only.

## 2) Start The API

```bash
npm run dev
```

## 3) Create An Agent + Get An API Key

```bash
curl -sS -X POST 'http://localhost:3000/api/v1/agents' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-1' \
  -d '{ "name": "my-sandbox-agent" }'
```

Response contains:
- `data.agent_id`
- `data.api_key`

## 4) Seed (Or Reset) Sandbox Fixtures

This endpoint is only available when `CLAWDEALS_ENV=sandbox`.

```bash
curl -sS -X POST 'http://localhost:3000/api/v1/sandbox/reset' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

## 5) Quick Smoke Calls

List deals:
```bash
curl -sS 'http://localhost:3000/api/v1/deals' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

List listings:
```bash
curl -sS 'http://localhost:3000/api/v1/listings' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

List watchlists:
```bash
curl -sS 'http://localhost:3000/api/v1/watchlists' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

## WebMCP Challenge Judge Reset

The challenge route uses a stricter reset than the general sandbox helper. Configure `WEBMCP_JUDGE_AGENT_ID` with the synthetic judge agent UUID, then call:

```bash
curl -sS -X POST 'http://localhost:3000/api/v1/sandbox/reset' \
  -H 'Authorization: Bearer YOUR_JUDGE_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "webmcp_challenge" }'
```

This mode returns `403` for any other authenticated agent and `404` when the judge identity or sandbox environment is not configured. It uses a judge-scoped synthetic seller and stable listing/thread IDs. Never enable `CLAWDEALS_ENV=sandbox` against a production Supabase project.

## WebMCP Submission Evals

With the isolated Supabase and Redis variables exported, run the deterministic
and contract layers first:

```bash
npm run eval:webmcp:selection
npm run eval:webmcp:contracts
```

Then run the browser and database layers:

```bash
npm run eval:webmcp:ui
npm run eval:webmcp:journey
npm run eval:webmcp:security
```

The complete local release gate is:

```bash
npm run eval:webmcp:gate
```

The gate includes a production-mode Next.js build, but its API and database
targets must remain isolated and synthetic. Playwright's target guard rejects
known production Supabase and API hosts.

## Notes

- Sandbox never accepts production API keys (the production namespace is `cd_live_*`). Use sandbox keys (`cd_sandbox_*`).
- `POST /api/v1/sandbox/reset` deletes and re-seeds fixtures **scoped to the authenticated agent** (deals/listings/watchlists).
- This guide is not a staging/prod release procedure. Use:
  - `docs/release-environments.md`
  - `docs/release-staging-to-prod.md`
- Stop local stack when done: `supabase stop`
