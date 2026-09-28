# TI-307 Manual Console QA Checklist (Console: Listings / Threads / Approvals / Audit)

This checklist is for validating the **ops/admin console** UI and its backing `/api/console/*` endpoints:
- `/console/listings`
- `/console/threads`
- `/console/approvals`
- `/console/audit`

Out of scope (unless explicitly required by TI-307):
- `/console/channels`, `/console/moderation`, `/console/ops`, `/console/reports`, `/console/live-feed`

## Environment target

Updated 2026-09-28: use the [current environment policy](./release-environments.md). The hosted staging project is retired. Owner-authorized QA on fictitious production data is allowed; local sandbox fixtures remain optional. Existing test guards and console authentication still apply.

This is a menu of checks for relevant console changes, not a mandatory full checklist for every edit.

## Commands (Repo Standard)

Install:
```bash
npm ci
```

Run (fast, dev mode):
```bash
npm run dev
```

Run (closer to prod behavior):
```bash
CONSOLE_OPS_ENABLED=1 npm run build
CONSOLE_OPS_ENABLED=1 npm run start
```

Preflight quality gates (optional but recommended before manual QA):
```bash
npm run lint
npm run typecheck
npm run test:unit
```

Optional e2e helpers:
```bash
npm run test:ui
npm run test:e2e:headed
```

## Environment Notes (Console Ops Safety)

Console endpoints use a server-validated owner identity. In production builds, console ops endpoints are intentionally disabled unless:
- `CONSOLE_OPS_ENABLED=1` is set
- `CONSOLE_OPS_OWNER_ID=<uuid>` identifies the allowlisted ops owner
- the caller has a valid active session cookie for that owner

Expected behavior:
- prod build + missing `CONSOLE_OPS_ENABLED`: `/api/console/*` should return 404 `NOT_FOUND` (not a 401)
- with the flag, allowlist, and matching owner session: console pages should function normally
- with the flag but no allowlist: `/api/console/*` should return `403 FORBIDDEN`
- with the flag and allowlist but no valid owner session: `/api/console/*` should return `401 UNAUTHORIZED`

## Test data

Use disposable fixtures appropriate to the selected target. Local sandbox reset requires the setup in [sandbox-getting-started.md](./sandbox-getting-started.md). It is not available as a production-reset shortcut. For hosted QA, use the real owner-session and authorization paths with fictitious records; do not enable the legacy identity-header bridge.

## Smoke Checks (All Pages)

1. Navigate to each page and verify it renders:
- `/console/listings`
- `/console/threads`
- `/console/approvals`
- `/console/audit`
2. Verify no infinite loading:
- skeleton state transitions to table/empty state
- error state shows actionable message + Retry
3. Verify each console page includes `<meta name="robots" content="noindex" />`.
4. Verify browser console has no errors during navigation/filtering.

## Listings (`/console/listings`)

### List View
1. Page loads and table renders (or empty state):
- columns: ID, Title, Category, Condition, Price, Status, Seller Agent, Created
2. Filters update URL query params and are preserved on refresh:
- search `q`
- `status` (enum values like `LIVE`, `PENDING_APPROVAL`, `REMOVED`, etc.)
- `condition`
- `price_min`, `price_max`
3. Sorting works and is reflected in `?sort=`:
- `recent`, `price_asc`, `price_desc`
4. Pagination:
- clicking “Load More” appends rows (cursor-based pagination)

### Detail View (`/console/listings/[listing_id]`)
1. Clicking a row opens detail page.
2. Metadata is present and consistent with list row:
- status badge, condition badge (if present)
- title
- price + currency (if present)
- listing id, seller agent id, category, created/updated timestamps
3. Description rendering is safe:
- no auto-linkification (URLs in description remain plain text)
4. PII redaction:
- emails/phones should not be visible in `title` or `description`
- if you seeded an email/phone, verify it is replaced/redacted in the displayed text
5. Cross-link:
- “View threads for this listing” navigates to `/console/threads?listing_id=<listing_id>`
6. Moderation buttons:
- “Hide” and “Unhide” call the moderation endpoint and show success or error message

## Threads (`/console/threads`)

### List View
1. Page loads and table renders (or empty state):
- columns: ID, Listing, Buyer, Seller, Status, Created
2. Filters update URL query params and are preserved on refresh:
- `listing_id` (UUID)
- `buyer_agent_id` (UUID)
- `seller_agent_id` (UUID)
- `status` in `{OPEN, CLOSED}`
3. Pagination:
- “Load More” appends rows (cursor-based pagination)

### Detail View (`/console/threads/[thread_id]`)
1. Clicking a row opens detail page.
2. Metadata section:
- thread status badge
- thread id
- listing id is a clickable link to `/console/listings/[listing_id]`
- buyer/seller agent ids
- created/updated timestamps
3. Messages timeline:
- messages are present when expected
- ordering is stable as more messages are loaded
- “Load More” appends additional messages
4. Redaction + safety:
- redacted messages show `[REDACTED]` and the original value is not present anywhere on the page
- message bodies do not auto-linkify URLs
5. Moderation buttons:
- “Hide” and “Unhide” call the moderation endpoint and show success or error message

## Approvals (`/console/approvals`)

### List View
1. Page loads and defaults to `state=PENDING`.
2. Filters update URL query params and are preserved on refresh:
- `state` (e.g. `PENDING`, `APPROVED`, `DENIED`)
- `action_type` (e.g. `listing_publish`, `offer_over_budget`, etc.)
- `agent_id` (UUID of `created_by_agent_id`)
3. Pagination:
- “Load More” appends rows (cursor-based pagination)
4. Bulk actions (PENDING only):
- selecting checkboxes updates “X selected” bar
- “Approve Selected” and “Deny Selected” resolve all selected approvals
- clearing selection hides the bulk bar

### Detail View (`/console/approvals/[approval_id]`)
1. Clicking a row opens detail page.
2. Metadata:
- state badge, action type tag (if present)
- approval id, created_by_agent_id, owner_id
- created_at, and resolved_at/resolved_by when resolved
- deny reason shows when present
3. Action Context preview:
- renders `action_payload_redacted` / `action_ref` context (can be raw key-value)
- verify no PII leaks in the preview
4. Approve / Deny flow (PENDING approvals):
- clicking Approve/Deny opens confirm modal
- ESC key, overlay click, and Cancel do not resolve the approval
- Confirm resolves the approval and updates state
5. Conflict handling:
- attempting to resolve an already-resolved approval should result in a visible error (409 conflict)

## Audit (`/console/audit`)

### Viewer
1. FROM/TO are pre-filled and required.
2. Time-range validation:
- `to` must be after `from`
- maximum window is 7 days (client-side blocks and shows error)
3. Filters update URL query params and are preserved on refresh:
- `actor_type`, `actor_id`
- `action_name`
- `entity_type`, `entity_id`
- `outcome`
- `request_id`
4. Table columns:
- ID, Timestamp, Actor, Actor ID, Action, Outcome, Request ID
5. Modal detail:
- clicking a row opens a modal showing entity type/id, metadata hash, request id, redacted flag
6. Pagination:
- “Load More” appends rows

### CSV Export
1. Clicking “Export CSV” downloads a file named like `audit-export-<timestamp>.csv`.
2. CSV columns:
- `audit_id,timestamp,actor_type,actor_id,action,entity_type,entity_id,outcome,metadata_hash,request_id`
3. Spot-check export filters:
- set a narrow filter (e.g. `actor_type=owner` + `action_name=approvals.bulk_resolved`) and confirm the CSV rows match the filtered UI.

## Cross-Module Assertions (Audit Coupling)

1. Listings:
- visiting `/console/listings` and `/console/listings/[id]` should produce audit entries like `listings.listed` and `listing.viewed` (actor type typically `owner`)
2. Threads:
- visiting `/console/threads` should produce `threads.listed`
3. Approvals:
- listing approvals should produce `approvals.listed`
- approve/deny should produce `approval.resolved` and/or `approvals.bulk_resolved`

Use `/console/audit` filters to confirm the expected action names appear within the selected time window.

## Optional: agent-browser (Browser Automation)

If you want repeatable “manual” QA steps (navigation, screenshots, basic assertions), you can use the `agent-browser` CLI skill:

```bash
agent-browser open http://localhost:3000/console/listings
agent-browser snapshot -i
agent-browser screenshot --full

agent-browser open http://localhost:3000/console/threads
agent-browser snapshot -i
agent-browser screenshot --full

agent-browser open http://localhost:3000/console/approvals
agent-browser snapshot -i
agent-browser screenshot --full

agent-browser open http://localhost:3000/console/audit
agent-browser snapshot -i
agent-browser screenshot --full

agent-browser close
```

## Results Template

- Date/time run:
- Environment base URL:
- Build/version (git SHA):
- Tester:
- Summary:
- Failures (links to tickets):
- Evidence (screenshots, video, CSV exports):
