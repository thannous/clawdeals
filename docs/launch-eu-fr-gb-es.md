# EU Launch Infrastructure: FR, GB, ES

This runbook describes the repository configuration for the European markets. It records
what is durable in the repository and what still requires authenticated service
access. It contains no credentials.

## Production architecture

- One European production stack for all three markets; never one stack per country.
- Cloudflare owns `clawdeals.com` DNS, the marketing Worker, redirects, and WAF.
- `app.clawdeals.com` remains DNS-only at Cloudflare and points directly to Vercel.
- Vercel hosts the Next.js app and APIs. `vercel.json` pins Functions to Dublin (`dub1`).
- Supabase hosts Postgres/Auth/Storage in one European project, currently AWS `eu-west-1` (Ireland).
- Upstash Redis provides rate limits, anti-replay, idempotency, and SSE streams.
- PostgreSQL remains the durable watchlist queue; Redis is not the job queue.

The app hostname must not be orange-cloud proxied until a long-running SSE test
has passed through Cloudflare. Cloudflare documents that proxied traffic is
subject to its proxy connection timeouts: <https://developers.cloudflare.com/dns/proxy-status/>.

## Market contract

Locales and markets are independent dimensions:

| Market | `market_code` | Native currency | Supported UI locales |
| --- | --- | --- | --- |
| France | `FR` | `EUR` | `fr`, `en`, `es` |
| Great Britain | `GB` | `GBP` | `en`, `fr`, `es` |
| Spain | `ES` | `EUR` | `es`, `en`, `fr` |

`market_code` is persisted on deals, listings, and watchlists. Matching first
filters watchlists by market, then compares the watchlist and entity currencies.
This prevents EUR price thresholds from being applied to GBP amounts. Existing
USD data is preserved as historical `INTL` data by the migration; no FX rewrite
is performed.

## Development environment

Updated 2026-09-28: `clawdeals-staging` was deleted. Use the [current environment policy](./release-environments.md): direct `main` deployment, optional local fixtures, and owner-authorized disposable production test data. Region, DNS, database and billing facts must be read from their services before changing infrastructure; repository configuration is not live-state proof.

## Localized content

Maintain content in `src/content/` with complete English, French and Spanish
copy, metadata and CTAs. Keep canonical URLs, locale alternates and JSON-LD
consistent. Verify endpoint examples and tool counts against code/OpenAPI;
publish no performance, adoption or market claims without evidence. Localize
currency, geography and examples for each market.

## Expected variables

Configure the selected backend and keep secrets outside Git. Do not restore the retired staging project merely to follow this document.

```text
APP_HOST
MARKETING_HOSTS
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_API_BASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
IDEMPOTENCY_SECRET
INTERNAL_CRON_SECRET
CRON_SECRET
OWNER_SESSION_SECRET
AUDIT_HMAC_SECRET
CONSOLE_OPS_ENABLED
```

App URLs use `https://app.clawdeals.com`. `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS` must remain unset on the hosted app.

## Regional alignment procedure

1. Read the current Supabase project region from the service, not from this repo.
2. If it is European, keep it and choose the closest Vercel/Upstash region.
3. For the current Ireland primary (`eu-west-1`), use Vercel Dublin (`dub1`).
4. If it is another European region, change `vercel.json` and Upstash to the
   nearest compatible region instead of migrating Supabase only for theoretical alignment.
5. If Supabase is outside Europe, stop. A region change requires a new project
   and data migration; Supabase does not move a project in place:
   <https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z>.

Upstash's global database has a selected primary region and optional read
regions. For this write-sensitive workload, the primary must be near Vercel;
do not add replicas merely for launch: <https://upstash.com/docs/redis/features/globaldatabase>.

## Crons and plans

Keep PostgreSQL as the durable queue. The [hosting guide](hosting-cloudflare-vercel.md#scheduled-jobs)
owns the Worker/Vercel schedule and shared cron-secret setup. Scheduled calls go
directly to `app.clawdeals.com`; they do not proxy normal app or SSE traffic.
Before increasing frequency, verify actual Redis/runner usage and the current
provider allowance. Paid schedulers or plan upgrades require explicit approval.

## Observability

The minimum launch signals are:

- `ops_obs_queue_depth_gauges_v1`: queue depth and oldest item age.
- `ops_obs_market_gauges_v1`: deal/listing/watchlist volume, match queue depth,
  24-hour matches, pending notifications, and notification errors by market.
- `sse.redis_error`, `thread_events.redis_error`, and rate-limit Redis errors in structured logs.
- `watchlist.match_queue_row_failed`, `watchlist.match_sse_failed`, and
  `notifications.outbox_enqueue_failed`, including `market_code` where known.

Both observability views are service-role only. They must never be granted to
`anon` or `authenticated`.

## Verification when changing market infrastructure

Select relevant market/matching integration checks, including GB/GBP behavior. Verify the deployed SHA, actual region, DNS/proxy routing and SSE behavior when those layers change. Database migrations are separate from Vercel app deployment. Do not reset a database or rerun all tests as a prerequisite for unrelated edits.

See the [release procedure](./release-staging-to-prod.md). Repository configuration does not establish actual scheduler execution or current provider plans; verify those with the services when needed.
