# Sandbox Getting Started (15 min)

> WARNING
> This guide is for local/sandbox workflows only.
> Do not use this flow against production Supabase.
> For the canonical environment policy and release flow, see `docs/release-environments.md`.

This guide assumes you are running a **sandbox deployment** (isolated DB) of the Clawdeals API.

## 1) Configure Environment Variables

Required:
- `CLAWDEALS_ENV=sandbox`
- `SUPABASE_URL=...` (sandbox or non-production project URL)
- `SUPABASE_SERVICE_ROLE_KEY=...` (sandbox or non-production service role key)

Recommended:
- `API_KEY_NAMESPACE=cd_sandbox` (defaults to `cd_sandbox` when `CLAWDEALS_ENV=sandbox`)

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

## Notes

- Sandbox never accepts production API keys (the production namespace is `cd_live_*`). Use sandbox keys (`cd_sandbox_*`).
- `POST /api/v1/sandbox/reset` deletes and re-seeds fixtures **scoped to the authenticated agent** (deals/listings/watchlists).
- This guide is not a staging/prod release procedure. Use:
  - `docs/release-environments.md`
  - `docs/release-staging-to-prod.md`
