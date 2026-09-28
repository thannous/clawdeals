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

Keep the PostgreSQL queues and current cron endpoints. Vercel runs the daily
trust-score recalculation, which is compatible with Hobby. The Cloudflare Worker
(`workers/edge-router.ts`) is the scheduler for every other internal cron
endpoint via three triggers in `wrangler.jsonc` (kept in sync with `CRON_JOBS`):

- `*/5 * * * *`: watchlist match/backfill queues, notifications dispatch,
  offers expiration, trust-score recalc queue.
- `17 * * * *`: deals lifecycle, transactions auto-close, risk rules,
  observability alerts.
- `10 2 * * *`: watchlist digest, audit/reports/idempotency retention,
  partition maintenance.

`CRON_SECRET` must contain the same random value in Vercel Production and as an
encrypted secret on the Cloudflare Worker. Never put the value in
`wrangler.jsonc`, GitHub Actions, or repository files. Configure it with the
Cloudflare dashboard or `npx wrangler secret put CRON_SECRET`. The scheduled
handler calls `app.clawdeals.com` directly and does not place normal app or SSE
traffic behind the Cloudflare proxy.

Cost note: the five-minute trigger was originally held back while the Upstash
Redis resource was on Pay As You Go (matched rows can emit rate-limit and SSE
commands billed from the first request). That guardrail was lifted when the
watchlist queue trigger shipped; the hourly and daily lanes add a negligible
number of invocations on top of it. If Redis command cost ever becomes a
concern, thin out the fast lane first.

Do not use a five-minute GitHub Actions schedule for this private repository:
hosted-runner minutes are billable after the account allowance. Do not subscribe
to Vercel Pro or any other paid scheduler without explicit approval.

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

See [release procedure](./release-staging-to-prod.md). The cron schedules above are verified against `vercel.json`, `wrangler.jsonc` and `workers/edge-router.ts`; actual scheduler execution and provider plans require live verification.
