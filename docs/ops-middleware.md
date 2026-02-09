# Ops Middleware v0

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
