# Optional local sandbox fixtures

Updated 2026-09-28. The hosted `clawdeals-staging` project and `sandbox.clawdeals.com` are retired. This guide describes the optional local sandbox runtime retained by the application and integration tests, not a release prerequisite.

Sandbox reset/seller-turn endpoints still reject production databases in code. Owner permission to test fictitious production data does not enable those endpoints. See [environment policy](./release-environments.md) and [local setup](./local-supabase-development.md).

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

## Retired remote bootstrap

`bootstrap:webmcp:judge` was written for the removed public sandbox. Its host/project restrictions are still implemented in `scripts/lib/bootstrap-webmcp-judge.mjs`; it is not a production onboarding command. Do not recreate the hosted sandbox or provision a judge credential merely to perform ordinary development. For local deterministic fixtures, inspect the selected integration spec and `WEBMCP_JUDGE_AGENT_ID` configuration.

## Optional WebMCP validation

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

The optional full WebMCP validation suite is:

```bash
npm run eval:webmcp:gate
```

The gate includes a production-mode Next.js build, but its API and database
targets must remain isolated and synthetic. This sandbox fixture suite still requires a local/non-production database. The separate SDK/MCP journey supports the explicit disposable-production opt-in in [environment policy](./release-environments.md); that flag does not unlock sandbox reset endpoints.

## Notes

- Sandbox never accepts production API keys (the production namespace is `cd_live_*`). Use sandbox keys (`cd_sandbox_*`).
- `POST /api/v1/sandbox/reset` deletes and re-seeds fixtures **scoped to the authenticated agent** (deals/listings/watchlists).
- For the current direct-main release workflow, use:
  - `docs/release-environments.md`
  - `docs/release-staging-to-prod.md`
- Stop local stack when done: `supabase stop`
