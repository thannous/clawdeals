# EU Launch Infrastructure: FR, GB, ES

This runbook is the source of truth for the first European launch. It records
what is durable in the repository and what still requires authenticated service
access. It contains no credentials.

## Production architecture

- One European production stack for all three markets; never one stack per country.
- Cloudflare owns `clawdeals.com` DNS, the marketing Worker, redirects, and WAF.
- `app.clawdeals.com` remains DNS-only at Cloudflare and points directly to Vercel.
- Vercel hosts the Next.js app and APIs. `vercel.json` pins Functions to Frankfurt (`fra1`).
- Supabase hosts Postgres/Auth/Storage in one European project.
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

## Isolated staging

Staging is a separate service boundary, not merely another Vercel environment
pointing at production data:

- Vercel project: `clawdeals-staging`, connected to the same repository without creating a repository branch.
- Domain: `staging.app.clawdeals.com`.
- Supabase: a separate project in a European region, with synthetic data only.
- Upstash: a separate Redis database with separate credentials and keyspace.
- Cloudflare: DNS-only staging app record; no production Worker route is required.
- Tests: `E2E_BASE_URL` and `API_BASE_URL` must target staging, never production.

The staging Vercel project must have automatic production-domain assignment
disabled for `app.clawdeals.com`. Its environment variables must reference only
the staging Supabase and Upstash resources.

## Expected variables

Set distinct values in each Vercel project. Never copy values between staging
and production.

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

Production values use `https://app.clawdeals.com`; staging values use
`https://staging.app.clawdeals.com`. `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS` must
remain unset in both hosted environments.

## Regional alignment procedure

1. Read the current Supabase project region from the service, not from this repo.
2. If it is European, keep it and choose the closest Vercel/Upstash region.
3. If it is Frankfurt, use Vercel `fra1` and Upstash `eu-central-1`.
4. If it is another European region, change `vercel.json` and Upstash to the
   nearest compatible region instead of migrating Supabase only for theoretical alignment.
5. If Supabase is outside Europe, stop. A region change requires a new project
   and data migration; Supabase does not move a project in place:
   <https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z>.

Upstash's global database has a selected primary region and optional read
regions. For this write-sensitive workload, the primary must be near Vercel;
do not add replicas merely for launch: <https://upstash.com/docs/redis/features/globaldatabase>.

## Crons and plans

Keep the PostgreSQL queues and current cron endpoints. The five-minute watchlist
cron requires Vercel Pro or Enterprise; Hobby accepts only daily schedules.
Do not lower the frequency or subscribe to a plan silently. If the current plan
is Hobby, leave the repository schedule unchanged and obtain approval for Pro
or configure an already-funded external scheduler.

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

## Deployment gate

1. Reset the local Supabase database and apply all migrations.
2. Run market/matching/migration unit tests, typecheck, lint, and relevant integration suites.
3. Apply migrations to isolated staging.
4. Run staging watchlist/listing/deal integrations, including a GB/GBP match.
5. Verify `x-vercel-id` shows `fra1` for an uncached API invocation.
6. Verify `app.clawdeals.com` resolves to Vercel without a Cloudflare `cf-ray` response header.
7. Open an SSE stream for longer than the normal client reconnect window and confirm events/replay.
8. Obtain the release approval before applying the additive migration to production.

No production region migration, resource creation, paid-plan change, or DNS
cutover is implicit in this runbook.
