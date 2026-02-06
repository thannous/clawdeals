const { test, expect } = require("@playwright/test");

const MOCK_DEALS = [
  {
    deal_id: "aaaa-1111-2222-3333-444444444444",
    title: "Test Deal NEW",
    source_url: "https://example.com/deal-new",
    price: 9.99,
    currency: "USD",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    tags: ["test", "new"],
    status: "NEW",
    temperature: null,
    votes_up: 0,
    votes_down: 0,
    created_at: new Date().toISOString()
  },
  {
    deal_id: "bbbb-1111-2222-3333-444444444444",
    title: "Test Deal ACTIVE",
    source_url: "https://example.com/deal-active",
    price: 19.99,
    currency: "EUR",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    tags: ["test", "active"],
    status: "ACTIVE",
    temperature: 72,
    votes_up: 5,
    votes_down: 1,
    created_at: new Date().toISOString()
  },
  {
    deal_id: "cccc-1111-2222-3333-444444444444",
    title: "Test Deal EXPIRED",
    source_url: "https://example.com/deal-expired",
    price: 29.99,
    currency: "USD",
    expires_at: new Date(Date.now() - 86400000).toISOString(),
    tags: ["test"],
    status: "EXPIRED",
    temperature: 10,
    votes_up: 8,
    votes_down: 3,
    created_at: new Date().toISOString()
  }
];

const MOCK_CURSOR = "eyJzb3J0IjoibmV3Iiwic3RhdHVzIjoiQUNUSVZFIn0=";

function mockDealsApi(page, { items = MOCK_DEALS, next_cursor = null, status = 200, delay = 0, error = null } = {}) {
  return page.route("**/api/console/deals?*", async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (error) {
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ERROR", message: error } })
      });
    }
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ items, next_cursor })
    });
  });
}

test.describe("Deals page", () => {
  // ------------------------------------------------------------------
  // Feed display
  // ------------------------------------------------------------------
  test.describe("Feed display", () => {
    test("renders deal list with correct columns", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");

      await expect(page.getByTestId("deals-list")).toBeVisible();
      const cards = page.getByTestId("deal-card");
      await expect(cards).toHaveCount(3);

      // Verify each card shows title, price, votes, and source link
      const firstCard = cards.nth(0);
      await expect(firstCard).toContainText("Test Deal NEW");
      await expect(firstCard).toContainText("9.99");
      await expect(firstCard.getByTestId("votes-up")).toContainText("0");
      await expect(firstCard.getByTestId("votes-down")).toContainText("0");
      await expect(firstCard.getByTestId("source-link")).toBeVisible();
    });

    test("shows loading skeleton while fetching", async ({ page }) => {
      await mockDealsApi(page, { delay: 2000 });
      await page.goto("/deals");

      await expect(page.getByTestId("deals-loading")).toBeVisible();
      await expect(page.getByTestId("deals-list")).not.toBeVisible();
    });

    test("shows empty state when no deals", async ({ page }) => {
      await mockDealsApi(page, { items: [] });
      await page.goto("/deals");

      await expect(page.getByTestId("deals-empty")).toBeVisible();
      await expect(page.getByTestId("deals-empty")).toContainText("No deals found");
    });

    test("shows error state on API failure", async ({ page }) => {
      await mockDealsApi(page, { status: 500, error: "Server error" });
      await page.goto("/deals");

      await expect(page.getByTestId("deals-error")).toBeVisible();
      await expect(page.getByTestId("deals-error")).toContainText("Server error");
      await expect(page.getByTestId("retry-btn")).toBeVisible();
    });
  });

  // ------------------------------------------------------------------
  // Filters
  // ------------------------------------------------------------------
  test.describe("Filters", () => {
    test("changes sort and refetches", async ({ page }) => {
      const requests = [];
      await page.route("**/api/console/deals?*", (route) => {
        requests.push(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_DEALS, next_cursor: null })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // Click TEMP sort
      await page.getByTestId("sort-temp").click();
      await page.waitForTimeout(400);

      const tempRequest = requests.find((u) => u.includes("sort=temp"));
      expect(tempRequest).toBeTruthy();
    });

    test("toggles status filter", async ({ page }) => {
      const requests = [];
      await page.route("**/api/console/deals?*", (route) => {
        requests.push(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_DEALS, next_cursor: null })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // Toggle EXPIRED on
      await page.getByTestId("status-filter-EXPIRED").click();
      await page.waitForTimeout(400);

      const expiredRequest = requests.find((u) => u.includes("status=EXPIRED"));
      expect(expiredRequest).toBeTruthy();
    });

    test("search input filters results", async ({ page }) => {
      const requests = [];
      await page.route("**/api/console/deals?*", (route) => {
        requests.push(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_DEALS, next_cursor: null })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // Type search query
      await page.getByTestId("search-input").fill("laptop");
      // Wait for debounce (300ms) + request
      await page.waitForTimeout(500);

      const searchRequest = requests.find((u) => u.includes("q=laptop"));
      expect(searchRequest).toBeTruthy();
    });

    test("filter state persists in URL query params", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // Change sort to TEMP
      await page.getByTestId("sort-temp").click();
      await page.waitForTimeout(400);

      // URL should reflect the sort param
      expect(page.url()).toContain("sort=temp");
    });
  });

  // ------------------------------------------------------------------
  // Pagination
  // ------------------------------------------------------------------
  test.describe("Pagination", () => {
    test("shows Load More button when next_cursor exists", async ({ page }) => {
      await mockDealsApi(page, { next_cursor: MOCK_CURSOR });
      await page.goto("/deals");

      await expect(page.getByTestId("deals-list")).toBeVisible();
      await expect(page.getByTestId("load-more-btn")).toBeVisible();
    });

    test("appends results on Load More click", async ({ page }) => {
      let callCount = 0;
      await page.route("**/api/console/deals?*", (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: MOCK_DEALS, next_cursor: MOCK_CURSOR })
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [
                {
                  deal_id: "dddd-1111-2222-3333-444444444444",
                  title: "Extra Deal",
                  source_url: "https://example.com/extra",
                  price: 5.00,
                  currency: "USD",
                  status: "ACTIVE",
                  temperature: 50,
                  votes_up: 2,
                  votes_down: 0,
                  tags: [],
                  created_at: new Date().toISOString()
                }
              ],
              next_cursor: null
            })
          });
        }
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();
      await expect(page.getByTestId("deal-card")).toHaveCount(3);

      await page.getByTestId("load-more-btn").click();
      await expect(page.getByTestId("deal-card")).toHaveCount(4);
    });

    test("hides Load More when no next_cursor", async ({ page }) => {
      await mockDealsApi(page, { next_cursor: null });
      await page.goto("/deals");

      await expect(page.getByTestId("deals-list")).toBeVisible();
      await expect(page.getByTestId("load-more-btn")).not.toBeVisible();
    });
  });

  // ------------------------------------------------------------------
  // Status behavior
  // ------------------------------------------------------------------
  test.describe("Status behavior", () => {
    test("NEW deals show HIDDEN temperature", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // First card is NEW — should show temp-hidden
      await expect(page.getByTestId("temp-hidden")).toBeVisible();
      await expect(page.getByTestId("temp-hidden")).toContainText("Hidden");
    });

    test("ACTIVE deals show temperature gauge", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const gauges = page.getByTestId("temp-gauge");
      await expect(gauges.first()).toBeVisible();
      await expect(gauges.first()).toContainText("72");
    });

    test("EXPIRED deals disable vote buttons", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // Third card is EXPIRED
      const expiredCard = page.getByTestId("deal-card").nth(2);
      await expect(expiredCard.getByTestId("vote-up-btn")).toBeDisabled();
      await expect(expiredCard.getByTestId("vote-down-btn")).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Vote modal
  // ------------------------------------------------------------------
  test.describe("Vote modal", () => {
    test("opens on vote button click", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      // Click vote-up on the ACTIVE deal (second card)
      const activeCard = page.getByTestId("deal-card").nth(1);
      await activeCard.getByTestId("vote-up-btn").click();

      await expect(page.getByTestId("vote-modal-overlay")).toBeVisible();
      await expect(page.getByTestId("vote-modal")).toBeVisible();
      await expect(page.getByTestId("vote-modal")).toContainText("Test Deal ACTIVE");
    });

    test("requires reason — submit with empty shows error", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const activeCard = page.getByTestId("deal-card").nth(1);
      await activeCard.getByTestId("vote-up-btn").click();
      await expect(page.getByTestId("vote-modal")).toBeVisible();

      // Submit without typing reason
      await page.getByTestId("vote-submit").click();

      await expect(page.getByTestId("vote-error")).toBeVisible();
      await expect(page.getByTestId("vote-error")).toContainText("Reason is required");
    });

    test("submits vote and closes modal", async ({ page }) => {
      await mockDealsApi(page);

      // Mock vote API
      await page.route("**/api/console/deals/*/vote", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            vote: { direction: "up", reason: "Great deal" },
            deal: { ...MOCK_DEALS[1], votes_up: 6 }
          })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const activeCard = page.getByTestId("deal-card").nth(1);
      await activeCard.getByTestId("vote-up-btn").click();
      await expect(page.getByTestId("vote-modal")).toBeVisible();

      await page.getByTestId("vote-reason").fill("Great deal");
      await page.getByTestId("vote-submit").click();

      // Modal should close after successful submit
      await expect(page.getByTestId("vote-modal-overlay")).not.toBeVisible();

      // Vote count should update
      await expect(activeCard.getByTestId("votes-up")).toContainText("6");
    });

    test("handles 409 ALREADY_VOTED", async ({ page }) => {
      await mockDealsApi(page);

      await page.route("**/api/console/deals/*/vote", (route) => {
        route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "ALREADY_VOTED", message: "Already voted on this deal" } })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const activeCard = page.getByTestId("deal-card").nth(1);
      await activeCard.getByTestId("vote-up-btn").click();
      await expect(page.getByTestId("vote-modal")).toBeVisible();

      await page.getByTestId("vote-reason").fill("Duplicate vote");
      await page.getByTestId("vote-submit").click();

      await expect(page.getByTestId("vote-error")).toBeVisible();
      await expect(page.getByTestId("vote-error")).toContainText("Already voted");
    });

    test("handles 429 with retry countdown", async ({ page }) => {
      await mockDealsApi(page);

      await page.route("**/api/console/deals/*/vote", (route) => {
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ retry_after_seconds: 10 })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const activeCard = page.getByTestId("deal-card").nth(1);
      await activeCard.getByTestId("vote-up-btn").click();
      await expect(page.getByTestId("vote-modal")).toBeVisible();

      await page.getByTestId("vote-reason").fill("Rate limited");
      await page.getByTestId("vote-submit").click();

      await expect(page.getByTestId("vote-error")).toBeVisible();
      await expect(page.getByTestId("vote-error")).toContainText("Rate limited");

      // Submit button should show retry countdown
      await expect(page.getByTestId("vote-submit")).toContainText(/Wait \d+s/);
      await expect(page.getByTestId("vote-submit")).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Security
  // ------------------------------------------------------------------
  test.describe("Security", () => {
    test("source_url renders as link with rel=noopener", async ({ page }) => {
      await mockDealsApi(page);
      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const sourceLinks = page.getByTestId("source-link");
      const firstLink = sourceLinks.first();

      await expect(firstLink).toHaveAttribute("rel", /noopener/);
      await expect(firstLink).toHaveAttribute("target", "_blank");
      await expect(firstLink).toHaveAttribute("href", "https://example.com/deal-new");
    });

    test("reason text rendered as plain text (not HTML)", async ({ page }) => {
      await mockDealsApi(page);

      await page.route("**/api/console/deals/*/vote", (route) => {
        route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "ALREADY_VOTED",
              message: '<img src=x onerror="alert(1)">'
            }
          })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      const activeCard = page.getByTestId("deal-card").nth(1);
      await activeCard.getByTestId("vote-up-btn").click();
      await expect(page.getByTestId("vote-modal")).toBeVisible();

      await page.getByTestId("vote-reason").fill("XSS test");
      await page.getByTestId("vote-submit").click();

      await expect(page.getByTestId("vote-error")).toBeVisible();

      // The XSS payload should be rendered as text, not as an actual img element
      const errorHtml = await page.getByTestId("vote-error").innerHTML();
      expect(errorHtml).not.toContain("<img");
      expect(errorHtml).toContain("&lt;img");
    });
  });
});
