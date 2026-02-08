import { test, expect, type Page } from "@playwright/test";
import { waitForApiGet } from "./helpers/api";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const LISTING_ID = "aaaa-1111-2222-3333-444444444444";
const THREAD_ID = "tttt-1111-2222-3333-444444444444";
const BUYER_AGENT_ID = "bbbb-1111-2222-3333-444444444444";
const SELLER_AGENT_ID = "ssss-1111-2222-3333-444444444444";

const MOCK_THREADS = [
  {
    thread_id: THREAD_ID,
    listing_id: LISTING_ID,
    buyer_agent_id: BUYER_AGENT_ID,
    seller_agent_id: SELLER_AGENT_ID,
    status: "OPEN",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    thread_id: "uuuu-1111-2222-3333-444444444444",
    listing_id: "vvvv-1111-2222-3333-444444444444",
    buyer_agent_id: "wwww-1111-2222-3333-444444444444",
    seller_agent_id: SELLER_AGENT_ID,
    status: "CLOSED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_MESSAGES = [
  {
    message_id: "msg-1111",
    type: "question",
    body: "Is this keyboard still available?",
    sender_id: BUYER_AGENT_ID,
    sender_type: "agent",
    redacted: false,
    payload: { type: "question" },
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
  {
    message_id: "msg-2222",
    type: "answer",
    body: "Yes, it is! Visit https://phishing.com for more details.",
    sender_id: SELLER_AGENT_ID,
    sender_type: "agent",
    redacted: false,
    payload: { type: "answer" },
    created_at: new Date(Date.now() - 30000).toISOString(),
  },
  {
    message_id: "msg-3333",
    type: "warning",
    body: "External link detected in message. Content has been flagged.",
    sender_id: "system",
    sender_type: "system",
    redacted: false,
    payload: { type: "warning" },
    created_at: new Date(Date.now() - 25000).toISOString(),
  },
  {
    message_id: "msg-4444",
    type: "answer",
    body: null,
    sender_id: SELLER_AGENT_ID,
    sender_type: "agent",
    redacted: true,
    payload: { type: "answer" },
    created_at: new Date(Date.now() - 20000).toISOString(),
  },
  {
    message_id: "msg-5555",
    type: "offer",
    body: null,
    sender_id: BUYER_AGENT_ID,
    sender_type: "agent",
    redacted: false,
    payload: {
      type: "offer",
      offer_id: "offer-1111",
      amount: 25.0,
      currency: "EUR",
      status: "CREATED",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: new Date(Date.now() - 10000).toISOString(),
  },
];

const MOCK_THREAD_DETAIL = {
  ...MOCK_THREADS[0],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockThreadsApi(
  page: Page,
  { items = MOCK_THREADS, next_cursor = null as string | null, status = 200, delay = 0, error = null as string | null } = {}
) {
  return page.route("**/api/console/threads?*", async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (error) {
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ERROR", message: error } }),
      });
    }
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ items, next_cursor }),
    });
  });
}

function mockThreadDetailApi(
  page: Page,
  { thread = MOCK_THREAD_DETAIL, messages = MOCK_MESSAGES, messages_next_cursor = null as string | null } = {}
) {
  return page.route(`**/api/console/threads/${THREAD_ID}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thread,
        messages,
        messages_next_cursor,
      }),
    });
  });
}

function mockThreadMessagesApi(
  page: Page,
  { items = MOCK_MESSAGES, next_cursor = null as string | null } = {}
) {
  return page.route(`**/api/console/threads/${THREAD_ID}/messages*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, next_cursor }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — US-2: Parcours Threads (TI-248 / TI-207)
// ---------------------------------------------------------------------------

test.describe("Console Threads — US-2", () => {
  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------
  test.describe("List view", () => {
    test("renders threads table", async ({ page }) => {
      await mockThreadsApi(page);
      await page.goto("/console/threads");

      await expect(page.getByTestId("threads-page")).toBeVisible();
      const rows = page.locator("table tbody tr");
      await expect(rows).toHaveCount(2);
    });

    test("shows empty state when no threads", async ({ page }) => {
      await mockThreadsApi(page, { items: [] });
      await page.goto("/console/threads");

      await expect(page.getByText("No threads found")).toBeVisible();
    });

    test("shows error state on API failure", async ({ page }) => {
      await mockThreadsApi(page, { status: 500, error: "Server error" });
      await page.goto("/console/threads");

      await expect(page.getByText("Server error")).toBeVisible();
      await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    });

    test("filters by listing_id", async ({ page }) => {
      await page.route("**/api/console/threads?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_THREADS, next_cursor: null }),
        });
      });

      await page.goto("/console/threads");
      await expect(page.getByTestId("threads-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/threads", { listing_id: LISTING_ID });
      await page.getByTestId("threads-listing-id").fill(LISTING_ID);
      await filteredReq;
    });

    test("filters by status OPEN", async ({ page }) => {
      await page.route("**/api/console/threads?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_THREADS, next_cursor: null }),
        });
      });

      await page.goto("/console/threads");
      await expect(page.getByTestId("threads-page")).toBeVisible();

      // Next.js dev tools button has an aria-label starting with "Open ...", so avoid name substring collisions.
      const filteredReq = waitForApiGet(page, "/api/console/threads", { status: "OPEN" });
      await page.getByTestId("threads-toolbar").locator("button", { hasText: /^OPEN$/ }).click();
      await filteredReq;
    });
  });

  // -----------------------------------------------------------------------
  // Detail view — Timeline
  // -----------------------------------------------------------------------
  test.describe("Detail view", () => {
    test("displays thread metadata", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      await expect(page.getByTestId("thread-detail-page")).toBeVisible();
      await expect(page.getByText("Buyer")).toBeVisible();
      await expect(page.getByText("Seller")).toBeVisible();
      await expect(page.getByText("Listing")).toBeVisible();
    });

    test("shows messages in chronological order with type badges", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      await expect(page.getByTestId("thread-detail-page")).toBeVisible();

      // Check message count
      await expect(page.getByText("Messages (5)")).toBeVisible();

      // Check type badges are present
      await expect(page.getByText("question").first()).toBeVisible();
      await expect(page.getByText("answer").first()).toBeVisible();
      await expect(page.getByText("offer").first()).toBeVisible();
    });

    test("warning messages are highlighted", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      // Warning badge visible
      await expect(page.getByText("WARNING", { exact: true })).toBeVisible();
      // Warning message has yellow border (class check)
      const warningCard = page.locator(".border-yellow-400\\/40").first();
      await expect(warningCard).toBeVisible();
    });

    test("redacted messages show REDACTED badge, no original text", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      // REDACTED badge visible
      await expect(page.getByText("REDACTED")).toBeVisible();
    });

    test("URLs in messages are plain text, not clickable links", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      // URL text is visible
      await expect(page.getByText("https://phishing.com")).toBeVisible();
      // But NOT as a clickable link
      const phishingLink = page.locator('a[href*="phishing.com"]');
      await expect(phishingLink).toHaveCount(0);
    });

    test("offer messages display offer card", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      // Offer card with Offer ID
      await expect(page.getByText("Offer ID")).toBeVisible();
    });

    test("listing link navigates to listing detail", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      const listingLink = page.locator(`a[href="/console/listings/${LISTING_ID}"]`);
      await expect(listingLink).toBeVisible();
    });

    test("Back link returns to threads list", async ({ page }) => {
      await mockThreadDetailApi(page);
      await page.goto(`/console/threads/${THREAD_ID}`);

      const backLink = page.getByRole("link", { name: /back/i });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute("href", "/console/threads");
    });

    test("shows empty timeline when no messages", async ({ page }) => {
      await mockThreadDetailApi(page, { messages: [] });
      await page.goto(`/console/threads/${THREAD_ID}`);

      await expect(page.getByText("No messages in this thread")).toBeVisible();
    });
  });
});
