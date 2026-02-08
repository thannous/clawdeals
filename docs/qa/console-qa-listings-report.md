# QA Verification Report: TI-247 Console Listings Module

## Summary

**Ticket**: TI-247 - Console Listings Module
**Environment**: http://localhost:3000
**Date**: 2026-02-08
**Overall Status**: NEEDS FIXES

### Acceptance Criteria Results
- PASS: 8/10
- FAIL: 1/10
- PARTIAL: 1/10

---

## Detailed Results

### Check 1: Table visible, listings displayed
**Status**: PASS
**Evidence**: Screenshot ss_3953yer86; JavaScript DOM verification
**Details**: Navigated to `/console/listings`. The `listings-page` data-testid is present, `listings-toolbar` exists, `listings-search` input exists. Table displays 51 rows (50 data + 1 header). All 4 seed listings visible: listing_live (f6b06e18), listing_pending (77b2c770), listing_draft (198b7cc7), listing_cheap (5a90f5b8). Table columns: ID, Title, Category, Condition, Price, Status, Seller Agent, Created.
**Notes**: Page uses skeleton loading placeholders during data fetch; data renders correctly after API response.

---

### Check 2: Filter status=PENDING_APPROVAL
**Status**: PASS
**Evidence**: Screenshot ss_71496d2d8; Network request confirmed
**Details**: Clicked PENDING_APPROVAL filter pill. The pill highlights in orange. Network request: `GET /api/console/listings?sort=recent&limit=50&status=PENDING_APPROVAL` (200 OK). Table filtered to 6 rows, all showing PENDING_APPROVAL status. Seed listing_pending (77b2c770) visible as "QA Pending Listing - Gamin..." with condition LIKE_NEW, price 5000 EUR. URL updated to `?status=PENDING_APPROVAL`.

---

### Check 3: Filter condition=NEW + price range
**Status**: PASS
**Evidence**: Screenshots ss_536176a4h (0-5000) and ss_62673axrp (0-15000); Network requests confirmed
**Details**: Reset status to ALL. Set price_min=0, price_max=5000 via `listings-price-min` and `listings-price-max` inputs, clicked NEW condition pill. Network request: `GET /api/console/listings?sort=recent&limit=50&condition=NEW&price_min=0&price_max=5000` (200 OK). Returned 0 results ("NO LISTINGS FOUND") because the only NEW listing (f6b06e18) has price 10000 which exceeds max 5000.

Verified by widening range to 0-15000: request `condition=NEW&price_min=0&price_max=15000` correctly returned 1 result -- f6b06e18 "QA Console Test - iPhone 1..." with condition=NEW, price=10000 EUR, status=LIVE.
**Notes**: All filter parameters correctly combined and sent to API. Empty result with tight range is correct behavior.

---

### Check 4: Sort price_asc
**Status**: PASS
**Evidence**: Screenshot ss_7374vtoij; Network request confirmed
**Details**: Navigated fresh to `/console/listings`. Clicked "Price Low" sort button. Pill highlights in orange. Network request: `GET /api/console/listings?sort=price_asc&limit=50` (200 OK). URL updated to `?sort=price_asc`. Table rows sorted with 0 EUR prices first, confirming ascending sort order.
**Notes**: Sort options available: Recent (default), Price Low (price_asc), Price High (price_desc).

---

### Check 5: Pagination Load More
**Status**: PASS
**Evidence**: JavaScript DOM verification; Network request with cursor parameter
**Details**: On listings page (sorted by price_asc), scrolled to bottom. "Load More" button present. Before clicking: 51 rows (50 data + 1 header). After clicking: 101 rows (100 data + 1 header). Network request used cursor-based pagination: `GET /api/console/listings?sort=price_asc&limit=50&cursor=eyJzb3J0IjoicHJpY2VfYXNjIi...` (200 OK). Load More button still available after first page load.
**Notes**: Pagination uses cursor-based approach per project conventions.

---

### Check 6: Click listing -> detail page
**Status**: PASS
**Evidence**: Screenshot ss_7487ireay; JavaScript DOM verification
**Details**: Clicked listing_live row (f6b06e18). URL navigated to `/console/listings/f6b06e18-deca-426b-879c-b3fbcb6da61b`. The `listing-detail-page` data-testid is present. Page title: "Listing Detail // CLAWDEALS".
**Notes**: Row click correctly navigates via client-side routing.

---

### Check 7: Metadata detail
**Status**: PASS
**Evidence**: Screenshot ss_7487ireay; JavaScript DOM text verification
**Details**: On listing_live detail page, all required metadata visible and correct:
- **Title**: "QA Console Test - iPhone 15 Pro"
- **Description**: "Brand new iPhone 15 Pro for console QA testing"
- **Category**: "electronics"
- **Condition**: "NEW" (badge)
- **Price**: "10000 EUR"
- **Status**: "LIVE" (colored badge)
- **Seller Agent**: "9444a2c9"
- **Created At**: "2026-02-08 19:55"
- **Updated At**: "2026-02-08 19:55"
- **Listing ID**: "f6b06e18"
**Notes**: Layout uses card with badges for status/condition, metadata in key-value pairs, separate sections for description and related threads.

---

### Check 8: URL plain text (listing_draft) - XSS check
**Status**: PASS
**Evidence**: JavaScript DOM verification on listing 198b7cc7
**Details**: Navigated to `/console/listings/198b7cc7-8c0d-4447-a689-ac38b7411d5a` (listing_draft). Description contains malicious URL: "Visit http://malicious.example.com for more details". Ran `document.querySelectorAll('[data-testid="listing-detail-page"] a[href*="malicious"]').length` -- result: **0**. Only 2 anchor tags on page: "Back" link (to `/console/listings`) and "View threads for this listing" link. URLs in user content rendered as plain text, not clickable links.
**Notes**: XSS protection working correctly.

---

### Check 9: No PII visible
**Status**: FAIL
**Severity**: Major
**Evidence**: JavaScript regex match on body.textContent
**Details**: On listing_draft detail page (198b7cc7), ran email regex `[\w.-]+@[\w.-]+\.\w+` against `document.body.textContent`. Found match: `test@leak.example.com`. The listing description "Contact seller at test@leak.example.com" is displayed in full without email redaction or masking. Phone pattern `\d{10,}` returned 0 matches.

**Steps to reproduce**:
1. Navigate to `/console/listings/198b7cc7-8c0d-4447-a689-ac38b7411d5a`
2. Read the description section
3. Email `test@leak.example.com` is visible in full

**Expected**: Email addresses in listing descriptions should be redacted in the admin console (e.g., `[REDACTED]` or `t***@***.com`)
**Actual**: Full email address displayed as plain text

---

### Check 10: "Related Threads" link
**Status**: PARTIAL
**Evidence**: Earlier successful page load during Check 6/7 (screenshot ss_7487ireay); JavaScript DOM verification from Check 8
**Details**: On listing_live detail page (f6b06e18), the "Related Threads" section is present with a "View threads for this listing" link. Link href: `/console/threads?listing_id=f6b06e18-deca-426b-879c-b3fbcb6da61b`. Same pattern confirmed on listing_draft (198b7cc7) with href `/console/threads?listing_id=198b7cc7-8c0d-4447-a689-ac38b7411d5a`.

Click-through navigation could not be fully verified due to intermittent detail page rendering stalls (API returned 503 then 200, but client rendering remained stuck showing only header). The link URL format is correct per the expected pattern `/console/threads?listing_id={id}`.
**Notes**: Other tabs in the tab group were observed loading threads with the correct `listing_id` filter parameter, confirming the target page works.

---

## data-testid Verification

| testid | Location | Status |
|--------|----------|--------|
| `listings-page` | List page (DIV) | FOUND |
| `listings-toolbar` | List page (DIV) | FOUND |
| `listings-search` | List page (INPUT) | FOUND |
| `listings-price-min` | Toolbar (INPUT) | FOUND |
| `listings-price-max` | Toolbar (INPUT) | FOUND |
| `listing-detail-page` | Detail page (DIV) | FOUND |

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
- **Recommendation**: Add PII redaction (regex-based email/phone stripping) to listing descriptions when rendered in the console

### Bug 2: Intermittent detail page rendering stall
- **Severity**: Minor
- **Location**: Listing detail page
- **Steps to reproduce**: Navigate to a listing detail page when server is under load
- **Expected**: Page content loads after API response (200)
- **Actual**: API returns 503 then 200, but page remains stuck showing only header; no error or loading indicator
- **Notes**: May be related to React Query cache handling of 503 -> 200 retry sequence, or server overload from concurrent clients

---

## Recommendation

The listings module is well-implemented with proper filtering, sorting, pagination, and detail views. Key actions:

1. **Priority**: Fix PII exposure in listing descriptions by implementing email/phone redaction or masking
2. **Investigate**: The intermittent detail page rendering stall when API returns 503 -> 200
3. **Consider**: Displaying price in human-readable format (e.g., "100.00 EUR" instead of "10000 EUR") for admin clarity
