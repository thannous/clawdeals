# Cloudflare Edge Router Deploy

This runbook describes the lightweight Cloudflare deployment used for `clawdeals.com`.

The Worker entrypoint is `workers/edge-router.ts`. It only handles host/path routing and upstream proxying.

## Environment Variables

Required in `wrangler.jsonc` (or per-environment secrets/vars):

- `MARKETING_HOST`: canonical marketing host (default: `clawdeals.com`)
- `APP_ORIGIN`: app upstream origin (example: `https://app.clawdeals.com`)
- `MARKETING_ORIGIN`: marketing upstream origin (example: `https://clawdeals.vercel.app`)

Important:
- `MARKETING_ORIGIN` must not point to `https://clawdeals.com` (would create a proxy loop).

## Routing Rules

1. `/en/*` on the marketing hosts -> `308` to the canonical English URL without the locale prefix
2. `www.clawdeals.com/*` -> `308` to `https://clawdeals.com/*`
3. `clawdeals.com/api/*` -> proxy to `APP_ORIGIN/api/*`
4. App sections on `clawdeals.com` (`/deals`, `/console`, `/start`, `/settings`, `/auth`, `/developer`, `/dev`, `/claim`, `/device`, `/pair`) -> `308` to `APP_ORIGIN`
5. Remaining `clawdeals.com/*` -> proxy to `MARKETING_ORIGIN`

## Commands

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
