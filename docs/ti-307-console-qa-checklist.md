# Console verification

Use these checks for changes to listings, threads, approvals and audit in the
ops console. Select the affected journeys; this is not a release-wide checklist.
Choose the backend and fixtures through the [environment policy](release-environments.md).

## Access and test setup

Production builds require `CONSOLE_OPS_ENABLED=1`, an allowlisted
`CONSOLE_OPS_OWNER_ID` and that owner's active session cookie. Verify the
[identity middleware](../src/server/middleware/console-ops-identity.ts):

| Setup | Expected API result |
| --- | --- |
| Console disabled in a production build | 404 `NOT_FOUND` |
| Enabled without an owner allowlist | 403 `FORBIDDEN` |
| Enabled with allowlist but no valid session | 401 `UNAUTHORIZED` |
| Enabled with the matching owner session | Authorized console operation |

Use fictitious records and real session authentication; never enable the legacy
identity-header bridge on the hosted app. Sandbox resets still require a
[non-production sandbox](sandbox-getting-started.md).

Existing Playwright coverage lives in `e2e/ui/console-*.spec.ts` and
`e2e/integration/console-*.spec.ts`; TesterArmy counterparts live in
`e2e/testerarmy/historical/console-*.e2e.ts`. Use the
[test guide](testerarmy-e2e.md) for discovery, runner prerequisites and reports.

## Checks by surface

| Surface | Critical outcomes |
| --- | --- |
| Every console page | Navigation works; loading resolves to data, empty or retryable error; filters survive refresh; pagination appends without duplicates; pages are `noindex`. |
| `/console/listings` | Search/status/condition/price/sort match the response. Details agree with the list; threads link to the selected listing; hide/unhide persists. |
| `/console/threads` | Listing/buyer/seller/status filters work; messages retain order across pagination; listing links and hide/unhide work. |
| `/console/approvals` | Default is `PENDING`; filters and bulk selection agree. Cancel, Escape and overlay dismissal cause no resolution; explicit confirm resolves once. A second resolution shows a conflict. |
| `/console/audit` | Required dates are ordered and span at most 7 days; filters survive reload; detail and pagination agree; CSV contains only the selected filtered rows. |

Check redaction in both displayed values and underlying page content: contact
information must not survive in listing text, messages, approval context or
exports. Untrusted text must not become an executable link or markup.

Confirm that listing/thread reads and approval resolutions produce the expected
audit events (`listings.listed`, `listing.viewed`, `threads.listed`,
`approvals.listed`, `approval.resolved` or `approvals.bulk_resolved`). Inspect
cross-owner denial and missing/expired session behavior as well as the happy path.

Retain source/build, target, fixture identity, selected checks, failures and useful
screenshots or traces. Keep session cookies, private records and exports out of
public artifacts. A mocked browser test does not prove backend authorization.
