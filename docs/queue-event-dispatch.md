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
  HTTP call. Notification recovery waits at least fifteen minutes after the last
  wake because PENDING also includes intentionally deferred digests/quiet hours.
  Cron alignment can extend that interval to approximately twenty minutes.
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
