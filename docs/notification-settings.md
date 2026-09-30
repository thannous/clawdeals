# Owner notification settings

The website exposes `/settings/notifications` in English, French and Spanish, from the settings navigation and My Watchlist. These are the same owner preferences used by Telegram commands and the notification dispatcher; no new transport or database schema is introduced.

Owners can choose realtime, hourly, daily or paused delivery, a time zone, the daily summary hour, quiet hours and event categories. Overnight quiet periods are supported. Pausing discards notifications processed while paused; resuming applies to future notifications. Quiet hours defer eligible alerts instead. Delivery uses an active Telegram connection, with verified owner email as the fallback. Linked identities are managed separately under `/settings/identities`.

## Website API

`GET /api/v1/owner/notification-preferences` returns `{ data: { preferences } }`, with the editable settings only and `Cache-Control: no-store`. For an owner without saved preferences it returns the existing dispatcher/database defaults without inserting a row: hourly, UTC, no quiet hours, daily hour 9, `watchlist_match` enabled.

`PATCH` accepts a nonempty partial object containing only:

- `mode`: `REALTIME`, `DIGEST_HOURLY`, `DIGEST_DAILY` or `SILENT`.
- `timezone`: a time zone accepted by the runtime, such as `Europe/Paris`.
- `quiet_enabled`: boolean; `quiet_start_min` / `quiet_end_min`: integer 0–1439 or null. Enabled quiet hours require distinct, non-null times.
- `daily_digest_hour`: integer 0–23.
- `event_types`: an array of `watchlist_match`, `offer_received`, `approval_required`, `transaction_updates`. An empty array disables all categories.

Authentication resolves the owner from the session. The endpoint denies anonymous and agent actors and never takes an owner or channel identity from the body. Invalid fields return 400 before creating preferences. Rate limits use the owner scope. Updates are audited. The website sends only changed fields, preserving other settings changed through Telegram, delivery timestamps, filters and channel pairing. Concurrent first saves create a single preferences row without replacing another save's fields. Invalid cross-field quiet-hour combinations are rejected.

## E2E verification

Prerequisites: Node 24.19.0, matching Playwright Chromium, `.env.local` with the authorized ClawDeals Supabase credentials and owner-session secret. The suite uses real HTTP-only owner sessions, unique synthetic owners without email or Telegram destinations, and a local Redis mock. It deletes only its own owners, sessions and preferences afterward. No notification or payment is initiated.

```bash
AUTH_ALLOW_LEGACY_IDENTITY_HEADERS=0 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
E2E_USE_LOCAL_UPSTASH_MOCK=1 WATCHPACK_POLLING=true \
PW_WEB_SERVER_MODE=prod \
PLAYWRIGHT_HTML_OPEN=never E2E_DEV_PORT=4331 \
API_BASE_URL=http://localhost:4331 \
mise exec node@24.19.0 -- npx playwright test \
  e2e/integration/notification-settings.spec.ts \
  --project=integration --workers=1 --trace=on --reporter=html,line
```

Coverage: defaults without preference writes, owner isolation, rejection of forged owner headers and invalid values, concurrent first saves, browser navigation and durable settings, overnight quiet hours, daily summaries, categories, preservation of existing fields and later Telegram changes, failed-save retry, and return to the same French settings page after login. Screenshots cover the French desktop form and Spanish mobile form. Retain `playwright-report/index.html` and the traces/attachments in `test-results/` as private local evidence; traces contain test session cookies.

This verifies a local application against the authorized disposable database. Hosted publication is a separate step. For actual notification dispatch and receipt evidence, see [queue dispatch operations](./queue-event-dispatch.md).
