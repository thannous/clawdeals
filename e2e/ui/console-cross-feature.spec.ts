import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Mock data — shared across features
// ---------------------------------------------------------------------------

const LISTING_ID = "llll-1111-2222-3333-444444444444";
const THREAD_ID = "tttt-1111-2222-3333-444444444444";
const APPROVAL_ID = "appr-1111-2222-3333-444444444444";
const BUYER_AGENT_ID = "bbbb-1111-2222-3333-444444444444";
const SELLER_AGENT_ID = "ssss-1111-2222-3333-444444444444";

const MOCK_LISTING = {
  listing_id: LISTING_ID,
  title: "Cross-Feature Test Listing",
  description: "A listing used for cross-feature testing",
  category: "electronics",
  condition: "NEW",
  price_amount: 99.99,
  currency: "EUR",
  status: "PENDING_APPROVAL",
  seller_agent_id: SELLER_AGENT_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_THREAD = {
  thread_id: THREAD_ID,
  listing_id: LISTING_ID,
  buyer_agent_id: BUYER_AGENT_ID,
  seller_agent_id: SELLER_AGENT_ID,
  status: "OPEN",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_MESSAGES = [
  {
    message_id: "msg-cf-1111",
    type: "question",
    body: "Is this still available?",
    sender_id: BUYER_AGENT_ID,
    sender_type: "agent",
    redacted: false,
    payload: { type: "question" },
    created_at: new Date().toISOString(),
  },
];

const MOCK_APPROVAL = {
  approval_id: APPROVAL_ID,
  action_type: "listing_publish",
  state: "PENDING",
  created_by_agent_id: SELLER_AGENT_ID,
  owner_id: "oooo-1111",
  created_at: new Date().toISOString(),
  resolved_at: null,
  resolved_by_human_id: null,
  action_payload_redacted: {
    listing_id: LISTING_ID,
    title: MOCK_LISTING.title,
  },
};

const MOCK_AUDIT_LOGS = [
  {
    audit_id: "aud-cf-1111",
    ts: new Date().toISOString(),
    actor: { type: "agent", id: SELLER_AGENT_ID },
    action: "listing.create",
    entity: { type: "listing", id: LISTING_ID },
    outcome: "SUCCESS",
    metadata: { hash: "sha256:cf1111", redacted: false },
    request_id: "req-cf-1111",
  },
  {
    audit_id: "aud-cf-2222",
    ts: new Date().toISOString(),
    actor: { type: "human", id: "ops-user" },
    action: "approval.resolved",
    entity: { type: "approval", id: APPROVAL_ID },
    outcome: "SUCCESS",
    metadata: { hash: "sha256:cf2222", redacted: false },
    request_id: "req-cf-2222",
  },
];

// ---------------------------------------------------------------------------
// Helpers — mock all console APIs
// ---------------------------------------------------------------------------

function mockAllApis(page: Page) {
  return Promise.all([
    // Listings list
    page.route("**/api/console/listings?*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [MOCK_LISTING], next_cursor: null }),
      });
    }),
    // Listing detail
    page.route(`**/api/console/listings/${LISTING_ID}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LISTING),
      });
    }),
    // Threads list
    page.route("**/api/console/threads?*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [MOCK_THREAD], next_cursor: null }),
      });
    }),
    // Thread detail
    page.route(`**/api/console/threads/${THREAD_ID}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_THREAD),
      });
    }),
    // Thread messages
    page.route(`**/api/console/threads/${THREAD_ID}/messages*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_MESSAGES, next_cursor: null }),
      });
    }),
    // Approvals list
    page.route("**/api/console/approvals?*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [MOCK_APPROVAL], next_cursor: null }),
      });
    }),
    // Approval detail
    page.route(`**/api/console/approvals/${APPROVAL_ID}`, (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_APPROVAL),
      });
    }),
    // Audit logs
    page.route("**/api/console/audit?*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_AUDIT_LOGS, next_cursor: null }),
      });
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Tests — US-7: Cross-Feature Lifecycle (TI-253)
// ---------------------------------------------------------------------------

test.describe("Console Cross-Feature — US-7", () => {
  test("Listing → Related Threads → Thread detail → View Listing (round trip)", async ({ page }) => {
    await mockAllApis(page);

    // 1. Start at listings list
    await page.goto("/console/listings");
    await expect(page.getByTestId("listings-page")).toBeVisible();

    // 2. Click on listing row to go to detail
    await page.locator("table tbody tr").first().click();
    await expect(page.getByTestId("listing-detail-page")).toBeVisible();
    await expect(page.getByText("Cross-Feature Test Listing")).toBeVisible();

    // 3. Click "Related Threads" link
    const threadsLink = page.getByRole("link", { name: /view threads for this listing/i });
    await expect(threadsLink).toBeVisible();
    await threadsLink.click();

    // 4. Now on threads page, filtered by listing_id
    await expect(page.getByTestId("threads-page")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`listing_id=${LISTING_ID}`));

    // 5. Click on thread row
    await page.locator("table tbody tr").first().click();

    // 6. Thread detail page with messages
    await expect(page.getByTestId("thread-detail-page")).toBeVisible();
    await expect(page.getByText("Messages (1)")).toBeVisible();

    // 7. Click listing link to go back to listing detail
    const listingLink = page.locator(`a[href="/console/listings/${LISTING_ID}"]`);
    await expect(listingLink).toBeVisible();
    await listingLink.click();

    // 8. Back on listing detail
    await expect(page.getByTestId("listing-detail-page")).toBeVisible();
  });

  test("Approvals → Review → Approve flow", async ({ page }) => {
    await mockAllApis(page);

    // 1. Go to approvals
    await page.goto("/console/approvals");
    await expect(page.getByTestId("approvals-page")).toBeVisible();

    // 2. Click on approval row
    await page.locator("table tbody tr").first().click();

    // 3. Approval detail
    await expect(page.getByTestId("approval-detail-page")).toBeVisible();
    await expect(page.getByText("listing_publish")).toBeVisible();

    // 4. Click Approve → modal → Confirm
    await page.getByRole("button", { name: /^approve$/i }).click();
    await expect(page.getByText("Approve this action?")).toBeVisible();
    await page.locator(".fixed button").filter({ hasText: /approve/i }).click();

    // 5. Success toast
    await expect(page.getByText(/action completed successfully/i)).toBeVisible();
  });

  test("Audit page shows event history filtered by entity_id", async ({ page }) => {
    await mockAllApis(page);

    // 1. Go to audit
    await page.goto("/console/audit");
    await expect(page.getByTestId("audit-page")).toBeVisible();

    // 2. Filter by entity_id
    await page.getByTestId("audit-entity-id").fill(LISTING_ID);
    await page.waitForTimeout(500);

    // 3. Verify audit logs are visible
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(2);
  });
});
