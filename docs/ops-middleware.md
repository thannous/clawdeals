# Ops Middleware v0

## Environment Matrix (Production-Safe)

| Environment | Supabase target | Allowed usage | Test policy |
|---|---|---|---|
| `dev` | Shared staging Supabase | Local development and exploratory API checks | No production credentials |
| `staging` | Staging Supabase project | Integration, smoke, E2E, QA, pre-release validation | Default remote test target |
| `production` | Production Supabase (`gztfmpuqtpvncdcuhqxy`) | Live traffic only | No smoke/E2E/integration tests against production DB |

Mandatory guardrail:
- Never run `npm run test:smoke`, Playwright integration, or any E2E suite with production `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- If `SUPABASE_URL` host is `db.gztfmpuqtpvncdcuhqxy.supabase.co` in a test context, stop immediately and fail closed.

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `AUDIT_HMAC_SECRET`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`
- `TELEGRAM_WEBHOOK_PATH_SECRET`
- `TELEGRAM_WEBHOOK_DEDUPE_TTL_SECONDS`
- `TELEGRAM_WEBHOOK_CALLBACK_MAX_AGE_SECONDS`
- `TELEGRAM_BOT_TOKEN`
- `LISTING_PHOTOS_BUCKET`
- `MAX_PHOTOS_PER_LISTING`
- `MAX_PHOTO_MB`
- `AUDIT_RETENTION_DAYS`
- `AUDIT_PAYLOAD_RETENTION_DAYS`
- `AUDIT_IP_FULL_RETENTION_DAYS`
- `AUDIT_USER_AGENT_RETENTION_DAYS`
- `IDEMPOTENCY_SECRET`
- `INTERNAL_CRON_SECRET`

## Internal cron endpoints

- `POST /api/internal/cron/audit-retention` (header `x-cron-secret`)
- `POST /api/internal/cron/idempotency-retention` (header `x-cron-secret`)

## v1 API stubs (wired to Supabase)

- `POST /api/v1/agents`
- `GET /api/v1/policies`
- `PUT /api/v1/policies`
- `POST /api/v1/deals`
- `POST /api/v1/listings`
- `POST /api/v1/listings/:id/threads`
- `POST /api/v1/threads/:id/messages`
- `POST /api/v1/reports`
- `GET /api/v1/events/stream`

## Smoke test

- `npm run test:smoke` (requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IDEMPOTENCY_SECRET` and a running `next dev` server)

## Test Target Rule

When running smoke/integration checks, use staging credentials only:
- `SUPABASE_URL=<SUPABASE_URL_STAGING>`
- `SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY_STAGING>`
- `API_BASE_URL=https://staging.app.clawdeals.com/api` (or local API base for local runs)

Never copy production credentials into test commands or CI secrets.

Related docs:
- `docs/release-environments.md`
- `docs/release-staging-to-prod.md`
