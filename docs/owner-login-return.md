# Owner magic-link return

The first-party `POST /api/v1/auth/login:start` route (and its `session:start`
and `session:login` aliases) accepts `{ "email": "…", "next": "/fr/my/missions/new?query=velo" }`.
`next` is optional. It uses the existing local-path allowlist; absolute URLs,
protocol-relative URLs and invalid values fall back to `/settings/account`.
Omitting it retains the legacy `/settings/identities` destination. The API and
email service both validate it. The generated verification URL carries the
normalized destination, with an `/fr` or `/es` prefix when appropriate. Resending
from verification preserves that destination too. These first-party auth routes
remain explicitly excluded from the partial agent SDK OpenAPI contract.

Mission draft contents remain only in the original tab's `sessionStorage`.
They are never copied into the login URL, email or `localStorage`. A verification
tab with the matching valid draft continues automatically. A separate tab without
that draft explains how to return to the original tab and choose **Resume my
mission**. It also offers an explicit link to continue here without those draft
edits. No cross-tab draft transfer is implied.

`magic-link-recovery.e2e.ts` exercises two real browser tabs with simulated email
and session responses; `MagicLinkReturn.test.tsx` covers same-tab/old-link fallback
and unrelated drafts. API/service tests validate the generated email URL through
a stubbed delivery transport. No test sends real mail. `mission-recovery.e2e.ts`
also proves that authenticated mission submission sends no request when its exact
retry state cannot be written and read back, and resumes safely once storage works.
