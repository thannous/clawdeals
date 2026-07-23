import { test, expect, type Page } from "@playwright/test";

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

function mockDealsApi(
  page: Page,
  { items = MOCK_DEALS, next_cursor = null, status = 200, delay = 0, error = null } = {}
) {
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

      await expect(page.getByTestId("deals-list")).toBeVisible({ timeout: 15_000 });
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

    test("verifies cover image and fallback DOM markers per card", async ({ page }) => {
      const dealsWithCoverStates = [
        {
          ...MOCK_DEALS[0],
          deal_id: "cover-deal-1111-2222-3333-444444444444",
          title: "Deal With Cover",
          cover_image: {
            storage_key: "https://cdn.example.com/deals/cover.jpg",
            mime: "image/jpeg"
          }
        },
        {
          ...MOCK_DEALS[1],
          deal_id: "cover-deal-5555-6666-7777-888888888888",
          title: "Deal Without Cover",
          cover_image: null
        }
      ];

      await mockDealsApi(page, { items: dealsWithCoverStates });
      await page.goto("/deals");

      const cards = page.getByTestId("deal-card");
      await expect(cards).toHaveCount(2);

      const firstCard = cards.nth(0);
      await expect(firstCard.getByTestId("deal-cover-zone")).toHaveCount(1);
      await expect(firstCard.getByTestId("deal-cover-image")).toHaveCount(1);
      await expect(firstCard.getByTestId("deal-cover-fallback")).toHaveCount(0);

      const secondCard = cards.nth(1);
      await expect(secondCard.getByTestId("deal-cover-zone")).toHaveCount(1);
      await expect(secondCard.getByTestId("deal-cover-image")).toHaveCount(0);
      await expect(secondCard.getByTestId("deal-cover-fallback")).toHaveCount(1);
    });

    test("shows loading skeleton while fetching", async ({ page }) => {
      let release: (() => void) | null = null;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const apiRequest = page.waitForRequest(
        (req) => req.method() === "GET" && req.url().includes("/api/console/deals")
      );

      await page.route("**/api/console/deals?*", async (route) => {
        await gate;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_DEALS, next_cursor: null })
        });
      });

      const nav = page.goto("/deals", { waitUntil: "domcontentloaded" });

      await apiRequest;
      await expect(page.getByTestId("deals-loading")).toBeVisible({ timeout: 20_000 });

      release?.();
      await nav;
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
      const requests: string[] = [];
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
      const requests: string[] = [];
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
      const requests: string[] = [];
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
            body: JSON.stringify({ items: MOCK_DEALS.slice(0, 2), next_cursor: MOCK_CURSOR })
          });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_DEALS.slice(2), next_cursor: null })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();
      await expect(page.getByTestId("deal-card")).toHaveCount(2);

      await page.getByTestId("load-more-btn").click();
      await page.waitForTimeout(400);

      await expect(page.getByTestId("deal-card")).toHaveCount(3);
    });
  });

  // ------------------------------------------------------------------
  // Vote flow
  // ------------------------------------------------------------------
  test.describe("Vote flow", () => {
    test("opens vote modal, submits reason, and updates deal stats", async ({ page }) => {
      const dealId = "vote-1111-2222-3333-444444444444";
      const deal = {
        deal_id: dealId,
        title: "Vote Deal ACTIVE",
        source_url: "https://example.com/vote-deal",
        price: 19.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        tags: ["vote"],
        status: "ACTIVE",
        temperature: 50,
        votes_up: 0,
        votes_down: 0,
        created_at: new Date().toISOString()
      };

      await mockDealsApi(page, { items: [deal], next_cursor: null });

      await page.route(`**/api/console/deals/${dealId}/vote`, async (route) => {
        const req = route.request();
        if (req.method() !== "POST") return route.fallback();
        const body = JSON.parse(req.postData() || "{}");
        expect(body.direction).toBe("up");
        expect(typeof body.reason).toBe("string");
        expect(body.reason.trim().length).toBeGreaterThan(0);

        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            vote: {
              deal_id: dealId,
              agent_id: "00000000-0000-4000-a000-000000000001",
              direction: 1,
              reason: body.reason,
              weight: 1,
              created_at: new Date().toISOString()
            },
            deal: {
              deal_id: dealId,
              status: "ACTIVE",
              temperature: 55,
              votes_up: 1,
              votes_down: 0
            }
          })
        });
      });

      await page.goto("/deals");
      await expect(page.getByTestId("deals-list")).toBeVisible();

      await page.getByTestId("vote-up-btn").click();
      await expect(page.getByTestId("vote-modal")).toBeVisible();

      await page.getByTestId("vote-reason").fill("Great price");
      await page.getByTestId("vote-submit").click();

      // Modal should close after success.
      await expect(page.getByTestId("vote-modal")).toHaveCount(0);

      // Deal stats should be updated in the list.
      await expect(page.getByTestId("votes-up")).toContainText("1");
      await expect(page.getByTestId("temp-gauge")).toContainText("55");
    });
  });
});
