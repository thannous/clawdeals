# QA Verification Report: TI-248 Console Threads Module

## Summary

**Ticket**: TI-248 - Console Threads Module
**Environment**: http://localhost:3000
**Date**: 2026-02-08
**Overall Status**: NEEDS FIXES

### Acceptance Criteria Results
- PASS: 9/12
- PARTIAL: 1/12
- FAIL: 2/12

---

## Detailed Results

### Check 1: Table visible
**Status**: PASS
**Details**: Navigated to `/console/threads`. The `threads-page` data-testid is present, `threads-toolbar` exists, and the table displays 50 rows including all 3 seed threads (thread1=224343c0, thread2=61c58c91, thread3=32ee8a78). Thread3 correctly shows CLOSED status.

---

### Check 2: Filter listing_id
**Status**: PASS
**Details**: Entered LISTING_LIVE_ID (`f6b06e18-deca-426b-879c-b3fbcb6da61b`) into the `threads-listing-id` filter input. Table filtered to exactly 2 rows: thread1 (224343c0, OPEN) and thread3 (32ee8a78, CLOSED). URL updated to include `?listing_id=f6b06e18-deca-426b-879c-b3fbcb6da61b`.

---

### Check 3: Filter status=OPEN
**Status**: PASS
**Details**: With the listing filter still active, clicked the "OPEN" status button. Table filtered to 1 row: only thread1 (224343c0, OPEN). Thread3 (CLOSED) correctly disappeared. URL updated to include `&status=OPEN`.

---

### Check 4: Click thread detail
**Status**: PASS
**Details**: Clicked on the thread1 row. URL navigated to `/console/threads/224343c0-d43e-4645-8f30-c0a56829e69d`. The `thread-detail-page` data-testid is present. Page title is "Thread Detail // CLAWDEALS".

---

### Check 5: Header metadata
**Status**: PASS
**Details**: On the thread detail page, all required metadata is visible:
- Thread ID: 224343c0 (truncated, with copy-on-click)
- Listing: f6b06e18 (truncated, clickable link to `/console/listings/f6b06e18-deca-426b-879c-b3fbcb6da61b`)
- Buyer: 387d8ff2 (matches BUYER2_AGENT_ID `387d8ff2-2e49-4369-ad7a-0d03b8de1a87`)
- Seller: 9444a2c9 (matches SELLER_AGENT_ID `9444a2c9-18e2-4f7d-a33d-fb48d9f7ca53`)
- Status badge: OPEN (cyan border badge)
- Created: 2026-02-08 19:56
- Updated: displayed (dash when null)

---

### Check 6: Timeline chronological
**Status**: PASS
**Details**: 4 messages displayed (header shows "Messages (4)"). Order is correct chronologically (ASC):
1. QUESTION (line index 16) - "Is shipping included?" by agent 387d8ff2
2. ANSWER (line index 23) - "Yes, free shipping in France" by agent 9444a2c9
3. WARNING (line index 30) - "Price alert: seller modified price" by SYSTEM
4. OFFER (line index 38) - Offer ID 05f5ce43 by agent 387d8ff2

---

### Check 7: Badges de type
**Status**: PARTIAL
**Details**: All 4 message types display type badges (QUESTION, ANSWER, WARNING, OFFER). However:
- QUESTION, ANSWER, and OFFER badges share the same visual styling: `border-secondary/40 text-secondary bg-secondary/10` (cyan/teal color).
- WARNING gets an additional yellow "WARNING" badge (`border-yellow-400/40 text-yellow-400 bg-yellow-400/10`).
- The card containers DO differ: warning cards have yellow borders (`border-yellow-400/40 bg-yellow-400/5`), and offer cards have a distinct sub-card for offer ID (`border-primary/40 bg-primary/5`).
- Question and answer badges are visually identical except for the text label. There is no color distinction between question vs. answer vs. offer type badges.

**Source file**: `/home/tchau@france.groupe.intra/WebstormProjects/clawdeals/src/ui/console/threads/MessageCard.tsx` lines 33-37.

---

### Check 8: Warning message styling
**Status**: PASS
**Details**: The system warning message ("Price alert: seller modified price") has distinctive styling:
- Card container: `border-yellow-400/40 bg-yellow-400/5` (yellow border and background)
- Sender badge shows "SYSTEM" instead of "AGENT"
- Additional yellow "WARNING" badge: `border-yellow-400/40 text-yellow-400 bg-yellow-400/10`
- Visually distinct from other message types (yellow tint on the entire card, visible in screenshots)

---

### Check 9: Message redacted (thread2)
**Status**: PASS
**Details**: Navigated to `/console/threads/61c58c91-a509-4242-9af8-d0d1355c4e0d`. Verified:
- A red "REDACTED" badge is visible on the message: `border-red-400/40 text-red-400 bg-red-400/10`
- The message text reads: `"Contact me at [REDACTED] for details"`
- The original email text `fake@email.com` is NOT present anywhere in the page text (confirmed via JavaScript search)
- The redacted message card also has yellow border styling (`border-yellow-400/40 bg-yellow-400/5`) since `isWarning` is true when `message.redacted` is set (MessageCard.tsx line 13)

---

### Check 10: URL plain text in messages
**Status**: PASS
**Details**: On thread detail pages, verified via JavaScript that no anchor `<a>` tags exist inside message body content. Total anchors on the page: 2 (only "Back" navigation link and the listing link in the header). Zero anchors inside any message content areas. Message body text is rendered as plain text in `<p>` or `<pre>` tags without URL linkification.

---

### Check 11: Offer card in timeline
**Status**: FAIL
**Severity**: Major
**Details**: The offer card in thread1's timeline is visible and shows:
- OFFER type badge (cyan)
- Agent ID: 387d8ff2
- Offer ID: 05f5ce43 (in a styled sub-card with `border-primary/40 bg-primary/5`)

**Missing**: The offer card does NOT display:
- Amount (expected: 9000 or 90.00)
- Currency (expected: EUR)
- Offer status

**Root cause**: In `MessageCard.tsx` (lines 73-86), the offer sub-card only renders `payload.offer_id` and optionally `payload.previous_offer_id`. There is no rendering of `payload.amount_cents`, `payload.currency`, or `payload.status`.

**Expected behavior**: The offer card should display the offer amount (9000 cents = 90.00 EUR or displayed as 9000), currency (EUR), and current status.

**Recommendation**: Add amount, currency, and status fields to the offer sub-card in `MessageCard.tsx` within the `isOfferLike` section.

---

### Check 12: "View Listing" link
**Status**: PASS
**Details**: On thread1 detail, the listing ID in the header metadata section (`f6b06e18`) is a clickable link (anchor tag) pointing to `/console/listings/f6b06e18-deca-426b-879c-b3fbcb6da61b`. Clicking it navigated to the listing detail page (tab title changed to "Listing Detail // CLAWDEALS", URL confirmed). Note: the link is not labeled "View Listing" but is the listing ID itself in the header - functionally correct.

---

## Bugs Found

### Bug 1: Offer card missing amount, currency, and status
- **Severity**: Major
- **Location**: `src/ui/console/threads/MessageCard.tsx` lines 73-86
- **Steps to reproduce**:
  1. Navigate to `/console/threads/224343c0-d43e-4645-8f30-c0a56829e69d`
  2. Scroll to the OFFER message (4th message)
  3. Observe the offer sub-card only shows "OFFER ID 05f5ce43"
- **Expected**: Offer card displays amount (9000/90.00), currency (EUR), and status
- **Actual**: Only offer_id is displayed

### Bug 2: Message type badges lack color distinction
- **Severity**: Minor
- **Location**: `src/ui/console/threads/MessageCard.tsx` lines 33-37
- **Steps to reproduce**:
  1. Navigate to any thread detail with multiple message types
  2. Compare QUESTION, ANSWER, and OFFER type badges
- **Expected**: Different message types have visually distinct badge colors (e.g., blue for question, green for answer, orange for offer)
- **Actual**: QUESTION, ANSWER, and OFFER badges all use the same cyan/teal `text-secondary` color scheme. Only WARNING has a distinct yellow badge.

---

## UX Observations

1. The message body is displayed as raw JSON (`{ "text": "..." }`) rather than extracting and showing just the text content. Consider parsing the payload and displaying just the text field for a cleaner UX.
2. The "Listing" field in the header metadata is a clickable link (good), but it's not obvious it's clickable since TruncatedId already has copy-on-click behavior. The link and copy behaviors may conflict (stopPropagation is used on the Link wrapper to handle this, which works).
3. Thread3 (CLOSED, no messages) shows "No messages in this thread." - correct empty state handling.

---

## Recommendation

The primary fix needed is adding amount, currency, and status to the offer card rendering in `MessageCard.tsx`. This is a Major severity bug that impacts the usefulness of the thread timeline for admin monitoring. The badge color distinction is a Minor UX improvement that could be addressed separately.
