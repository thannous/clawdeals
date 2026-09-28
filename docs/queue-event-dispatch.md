# Queue wake-ups and recovery

The existing database queue/outbox rows remain the source of truth. Inserts and
producer updates wake their existing Vercel consumers through asynchronous
`pg_net`; no listing, owner or notification body is sent in the HTTP request.

- Each queue coalesces wake-ups for 30 seconds. Consumer retries do not wake
  themselves. Database writes still commit if wake-up scheduling fails.
- A private database lease excludes concurrent webhook/cron consumers. The token
  is unique per invocation, only its owner can release it, and it expires after
  five minutes. Each HTTP handler is capped at sixty seconds.
- Postgres checks for remaining work every five minutes; empty queues cause no
  HTTP call. Notifications have an indexed `available_at`; only due rows wake
  consumers and are fetched. Quiet hours and hourly/daily digests are evaluated
  together in local time, including DST gaps/repeated hours and fixed offsets.
- Preference insert/update/delete recalculates pending schedules. A compact
  snapshot of scheduling fields is reconciled in SQL every five minutes to catch
  concurrent insert/preferences changes. Permanently quiet or disabled event
  types remain suspended without HTTP; re-enabling them schedules work again.
  SILENT mode still wakes the consumer to mark rows SUPPRESSED.
- Failed attempts move eligibility at least fifteen minutes ahead. A preference
  change may shorten this delay intentionally. Work becoming due is recovered
  within the next five-minute cron window; this is not an exact-time delivery SLA.
- Cloudflare keeps an hourly fallback at minute 2. Offer expiration remains on
  its independent five-minute schedule.
- A crash after external notification delivery but before marking it delivered
  can still cause a duplicate. The lease prevents overlapping workers; it is not
  an exactly-once delivery guarantee.

## Activation and rollback

Apply the migration, set Vercel Production `QUEUE_DISPATCH_SECRET`, then deploy
these handlers before activating Vault. The secret is distinct from existing
`CRON_SECRET`/`INTERNAL_CRON_SECRET` and authorizes only the four queue consumers.

With the service-role client, call `configure_queue_dispatch_v1` using a
`p_secret` of at least 32 characters matching the Vercel value. This bounded RPC
sets only Vault entry `clawdeals_queue_dispatch_secret`; it is not callable by
anon/authenticated. Never print or commit the secret. Triggers do nothing until
this entry exists. Rotate Vercel first, deploy, then update Vault; durable rows
and cron recovery bridge temporary authentication failures.

To revert, first restore the fifteen-minute Cloudflare queue schedule and remove
or rename this Vault entry using the privileged Supabase administration channel.
Keep the queue tables. After wakes stop, an older application may be restored.
The private dispatch-state table intentionally has RLS with no policies and no
direct service-role table grant; narrowly scoped definer helpers are its only
application access. Supabase's no-policy informational notice is expected.

## Verification

Existing queue service tests cover business processing. Isolated tests are kept
for gaps browser E2E cannot reproduce reliably: credential scope, overlapping
consumer claims, token-safe release, expiry, transaction rollback, burst
coalescing, retry suppression and producer survival on wake failure.

Run the disposable PostgreSQL check without production credentials:

```sh
npm install --prefix /tmp/clawdeals-queue-sql-check @electric-sql/pglite@0.5.8 --no-save --package-lock=false
CLAWDEALS_PGLITE_MODULE=/tmp/clawdeals-queue-sql-check/node_modules/@electric-sql/pglite/dist/index.js \
  mise exec node@24.19.0 -- node scripts/verify-queue-event-dispatch.mjs
```

It uses real PostgreSQL trigger/lease semantics with simulated pg_net, cron and
Vault adapters. It checks sequential claim exclusion, not distributed load or
actual external delivery. The result is saved at `/tmp/clawdeals-queue-sql-results.json`.
For deployment verification, inspect extension/job metadata, privileges, counts,
`private.queue_dispatch_state.last_request_id` and `net._http_response` status;
never select stored request headers or decrypted Vault data into logs.

## Hosted pg_net permissions

Supabase manages pg_net objects as `supabase_admin`. Migration
`20260928211927_restrict_queue_transport_access.sql` records a best-effort
revocation; the inherited PUBLIC grants remained after execution. Do not treat
that migration succeeding as evidence that the SQL privileges were removed.

The access boundary is the Data API schema allowlist and roles without direct
login. On 2026-09-28, a public-key request with `Accept-Profile: net` returned
HTTP 406 / `PGRST106` (`Invalid schema: net`); both client roles were NOLOGIN,
and the three queue RPCs denied execution to anon/authenticated. Keep `net`
out of exposed schemas and never expose transport tables through views or
client-callable definer functions. This is the hosted behavior described in
[Supabase's pg_net permissions documentation](https://supabase.com/docs/guides/database/extensions/pg_net#permissions).

The advisor also reports pg_net installed in public. The extension is not
relocatable; changing its extension schema requires dropping its transport
queue and response history. No reinstall was performed merely to clear that
notice. These checks do not establish end-to-end external delivery: production
queues were empty, and trigger behavior was verified using disposable PGlite.

## Eligibility migration rollout

Apply `notification_eligibility_schedule` before deploying the consumer using
`available_at`. It adds columns and an index without removing queue rows. Old
consumers remain compatible; their existing preference checks still apply.
Restore old application code before considering any schema rollback. The SQL
snapshot stores scheduling settings only, not destination addresses or payloads.

Run the disposable calendar/trigger checks (same PGlite prerequisite as above):

```sh
CLAWDEALS_PGLITE_MODULE=/tmp/clawdeals-queue-sql-check/node_modules/@electric-sql/pglite/dist/index.js \
  mise exec node@24.19.0 -- node scripts/verify-notification-schedule.mjs
```

Evidence: `/tmp/claw-notification-schedule-results.json`. These tests cover DST,
fixed offsets, retry delay, preference rescheduling, missed concurrent snapshots,
disabled event types, permissions and rollback. They simulate pg_net and do not
send external notifications.

When adding a notification event type, update both the TypeScript
`NOTIFICATION_EVENT_TYPES` list and the SQL eligibility allowlist in a new
migration. Otherwise the new type stays suspended. Preference snapshots include
only scheduling fields and event types; channel addresses and message payloads
are excluded. Production rollout of this scheduler was verified on commit
`b1182da` after migration `20260928220905`, with a successful recovery run and
no pending notifications at the observation time.
