# Ops Middleware v0

## Environment policy

Use [release-environments.md](./release-environments.md) for the current development-phase policy. Production test data is disposable by owner declaration; the deleted staging project is not a prerequisite. Existing smoke/Playwright guards still reject known production targets until explicitly adapted.

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

## Selected v1 API routes

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

- `npm run test:smoke` (requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IDEMPOTENCY_SECRET`, `MESSAGE_REDACTION_HMAC_SECRET` or `AUDIT_HMAC_SECRET`, and a running API server)

## Test targets

For local fixtures, follow [local setup](./local-supabase-development.md). Verify the target and loaded environment before running a script; an app on localhost can still use a remote database. `npm run test:smoke` retains its production-target guard.

The route list above is illustrative, not a complete API inventory. See [OpenAPI](./openapi-v1.yaml) and `src/pages/api/` for the implemented surface.
