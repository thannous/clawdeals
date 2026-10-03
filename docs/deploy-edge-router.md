# Cloudflare Edge Router Deploy

This runbook describes the lightweight Cloudflare deployment used for `clawdeals.com`.

The Worker entrypoint is `workers/edge-router.ts`. It handles host/path routing, upstream proxying, scheduled internal cron calls and the disabled-by-default remote MCP endpoint.

## Environment Variables

Required in `wrangler.jsonc` (or per-environment secrets/vars):

- `MARKETING_HOST`: canonical marketing host (default: `clawdeals.com`)
- `APP_ORIGIN`: app upstream origin (example: `https://app.clawdeals.com`)
- `MARKETING_ORIGIN`: marketing upstream origin (checked-in value: `https://app.clawdeals.com`)

Important:
- `MARKETING_ORIGIN` must not point to `https://clawdeals.com` (would create a proxy loop).

## Routing Rules

1. `/en/*` on the marketing hosts -> `308` to the canonical English URL without the locale prefix
2. `www.clawdeals.com/*` -> `308` to `https://clawdeals.com/*`
3. Exact `/api/mcp` is handled by the Worker and disabled unless `REMOTE_MCP_ENABLED=true`; other `clawdeals.com/api/*` paths proxy to `APP_ORIGIN/api/*`.
4. App sections on `clawdeals.com` (`/deals`, `/console`, `/start`, `/settings`, `/auth`, `/developer`, `/dev`, `/claim`, `/device`, `/pair`) -> `308` to `APP_ORIGIN`
5. Remaining `clawdeals.com/*` -> proxy to `MARKETING_ORIGIN`

## Scheduled jobs during development

Offer expiration runs every six hours (`0 */6 * * *`: 00:00, 06:00, 12:00 and
18:00 UTC). The displayed status and expiration cleanup/events can lag by up to
six hours; `offer_accept_v0` still rejects expired offers using `expires_at`
before accepting them, even while their status remains `CREATED`.
Database events wake watchlist matching,
backfill, notification dispatch and trustscore consumers when work arrives.
Cloudflare retains an hourly recovery pass at minute 2; other hourly and daily
maintenance keep their schedules. See `docs/queue-event-dispatch.md` for durable
recovery, credential setup and rollback.

Keep `wrangler.jsonc` triggers and `workers/edge-router.ts` in sync. The existing
`CRON_SECRET` Worker secret is required and must be preserved during deployment.

## Deployment commands

- Deploy production router:
```bash
npm run deploy:cloudflare
```

- Preview locally:
```bash
npm run preview:cloudflare
```

- Legacy (large OpenNext bundle, fallback only):
```bash
npm run deploy:cloudflare:opennext
```

## Validation Checklist

```bash
curl -I https://www.clawdeals.com/fr
curl -I https://clawdeals.com/en/guides
curl -I https://clawdeals.com/deals
curl -I https://clawdeals.com/api/v1/watchlist-signups
curl -I https://clawdeals.com/
```

Expected:
- `www` redirects to apex.
- `/en/*` redirects to the same English path without the prefix.
- app sections redirect to `app.clawdeals.com`.
- `/api/*` on apex is served via proxy (no cross-origin redirect).
- landing remains available on apex.
