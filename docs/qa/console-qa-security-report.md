# QA Verification Report: TI-254 Console Security Transversal

## Summary

**Ticket**: TI-254 - Security Transversal
**Environment**: http://localhost:3000
**Date**: 2026-02-08
**Overall Status**: RESOLVED (was: NEEDS FIXES)

> **Resolution (2026-02-08, verified 2026-08-07)**: Bug 1 (PII visible in listing
> descriptions) was fixed the same day in commit `ec2d8f0` — `redactEmailsAndPhones`
> (`src/server/utils/free-text-redaction.ts`) is now applied server-side to listing
> titles and descriptions in both `/api/console/listings` and
> `/api/console/listings/[listing_id]`, plus thread/message and approval-preview
> surfaces. Covered by unit tests in
> `src/__tests__/pages-api/console/listings/[listing_id]/index.test.ts`.

### Acceptance Criteria Results
- PASS: 5/6
- FAIL: 1/6

---

## Detailed Results

### Check 1: No auto-linkify URLs
**Status**: PASS
**Evidence**: JavaScript DOM verification on listing_draft detail page (198b7cc7)
**Details**: Navigated to `/console/listings/198b7cc7-8c0d-4447-a689-ac38b7411d5a`. Description contains "Visit http://malicious.example.com for more details". Ran `document.querySelectorAll('a[href*="malicious"]').length` — result: **0**. Only 2 anchor tags on the page: "Back" link and "View threads for this listing" link. URLs in user-generated content are rendered as plain text, not as clickable hyperlinks.

Also verified on thread detail pages: no `<a>` tags exist inside message body content. Message text is rendered in `<p>` or `<pre>` tags without URL auto-linkification.

---

### Check 2: No PII visible
**Status**: FAIL
**Severity**: Major
**Evidence**: JavaScript regex match on body.textContent
**Details**: Scanned all 4 console modules for PII (emails and phone numbers):

- **Listings**: On listing_draft detail page (198b7cc7), ran email regex `[\w.-]+@[\w.-]+\.\w+` against `document.body.textContent`. Found match: `test@leak.example.com`. The listing description "Contact seller at test@leak.example.com" is displayed in full without email redaction or masking.
- **Threads**: No PII found in thread list or thread detail pages. Thread2's redacted message correctly shows `[REDACTED]` instead of original email.
- **Approvals**: No PII found in approval list or detail pages.
- **Audit**: No PII found in audit table or modal detail views.

Phone pattern `\d{10,}` returned 0 matches across all modules.

**Steps to reproduce**:
1. Navigate to `/console/listings/198b7cc7-8c0d-4447-a689-ac38b7411d5a`
2. Read the description section
3. Email `test@leak.example.com` is visible in full

**Expected**: Email addresses in listing descriptions should be redacted in the admin console (e.g., `[REDACTED]` or `t***@***.com`)
**Actual**: Full email address displayed as plain text

---

### Check 3: Redaction enforcement
**Status**: PASS
**Evidence**: JavaScript DOM verification on thread2 detail page (61c58c91)
**Details**: Navigated to `/console/threads/61c58c91-a509-4242-9af8-d0d1355c4e0d`. Verified:
- A red "REDACTED" badge is visible: `border-red-400/40 text-red-400 bg-red-400/10`
- The message text reads: `"Contact me at [REDACTED] for details"`
- The original email `fake@email.com` is NOT present anywhere in the page text (confirmed via JavaScript search on `document.body.textContent`)
- The redacted message card has yellow border styling (`border-yellow-400/40 bg-yellow-400/5`) as a visual warning indicator

---

### Check 4: Modal confirmation blocks without confirm
**Status**: PASS
**Evidence**: Source code review of `src/ui/console/shared/ConfirmModal.tsx`
**Details**: No PENDING approvals were available for live modal testing (all consumed during earlier QA waves). Verified via source code analysis:

- **ESC key** (line 43): `handleKeyDown` calls `onCancel()` when `e.key === "Escape"` — does NOT trigger the action
- **Overlay click** (line 73): Clicking the backdrop div calls `onCancel()` — does NOT trigger the action
- **Cancel button** (line 84): Explicitly calls `onCancel()` — does NOT trigger the action
- **Confirm button** (line 91): Only this button calls `onConfirm()` — this is the ONLY path that triggers the action

The modal correctly prevents accidental approval/denial. All dismissal paths (ESC, overlay click, Cancel button) route through `onCancel()`, and only the explicit Confirm button routes through `onConfirm()`.

---

### Check 5: Time range mandatory for audit
**Status**: PASS
**Evidence**: Verified during TI-251 audit testing
**Details**: The `/console/audit` page pre-fills FROM and TO date inputs with a 1-day window (e.g., 07/02/2026 20:19 to 08/02/2026 20:19). Both `audit-from` and `audit-to` fields are mandatory — the API query always includes `from` and `to` parameters. The time range is enforced client-side before any API call is made.

---

### Check 6: Max 7 days limit
**Status**: PASS
**Evidence**: Verified during TI-251 audit testing (Check 8)
**Details**: Set FROM date to 10 days ago (29/01/2026). Red error message appeared: "Time range too large. Max 7 days allowed." Table shows "NO AUDIT ENTRIES FOUND - Try adjusting your filters." The request is blocked client-side before any API call is made.

---

## Bugs Found

### Bug 1: PII (email) visible in listing description
- **Severity**: Major
- **Location**: Listing detail page, description field
- **Steps to reproduce**:
  1. Navigate to `/console/listings/198b7cc7-8c0d-4447-a689-ac38b7411d5a`
  2. Observe email `test@leak.example.com` visible in description
- **Expected**: PII should be redacted from admin console views
- **Actual**: Email displayed in plain text
- **Recommendation**: Add PII redaction (regex-based email/phone stripping) to listing descriptions when rendered in the console. Note: thread messages already have redaction support via the `redacted` flag — a similar approach could be applied to listing descriptions.

---

## Recommendation

The console has strong security fundamentals: no URL auto-linkification (preventing XSS via clickable malicious links), proper redaction in thread messages, modal confirmation that blocks accidental actions, and mandatory time-bound audit queries. The one gap is PII exposure in listing descriptions, which should be addressed by implementing email/phone redaction at the rendering layer.
