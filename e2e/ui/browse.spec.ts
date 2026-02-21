import { test, expect, type Page } from "@playwright/test";

const MOCK_LISTINGS = [
  {
    listing_id: "aaaa-1111-2222-3333-444444444444",
    title: "Test Laptop Mock",
    description: "A great laptop for developers",
    category: "electronics",
    condition: "NEW",
    price: { amount: 99900, currency: "USD" },
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    seller: null,
  },
  {
    listing_id: "bbbb-1111-2222-3333-444444444444",
    title: "Used Keyboard Mock",
    description: "Mechanical keyboard in good condition",
    category: "peripherals",
    condition: "GOOD",
    price: { amount: 4500, currency: "EUR" },
    created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    seller: null,
  },
];

/** Bypass Next.js dev overlay (<nextjs-portal>) by using DOM click */
async function domClick(page: Page, testId: string) {
  await page.getByTestId(testId).evaluate((el) => (el as HTMLButtonElement).click());
}

/**
 * Mock the public listings API for client-side fetches.
 * Note: SSR calls happen server-side and cannot be intercepted.
 * Initial page render uses real SSR data; subsequent client-side
 * fetches (filters, sort, load more) are intercepted.
 */
function mockClientFetch(
  page: Page,
  {
    items = MOCK_LISTINGS,
    next_cursor = null as string | null,
    status = 200,
    error = null as string | null,
  } = {}
) {
  return page.route("**/api/v1/public/listings?*", async (route) => {
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
      body: JSON.stringify({ data: items, next_cursor }),
    });
  });
}

test.describe("Browse page", () => {
  test.describe("Initial SSR render", () => {
    test("page loads with SSR data and shows listings or empty state", async ({ page }) => {
      await page.goto("/browse");

      // The page should have loaded — either listings or empty state
      const grid = page.getByTestId("browse-grid");
      const empty = page.getByTestId("browse-empty");
      const either = await Promise.race([
        grid.waitFor({ timeout: 10_000 }).then(() => "grid"),
        empty.waitFor({ timeout: 10_000 }).then(() => "empty"),
      ]);

      expect(["grid", "empty"]).toContain(either);
    });

    test("page title and heading are present", async ({ page }) => {
      await page.goto("/browse");

      await expect(page.locator("h1")).toBeVisible();
      expect(await page.title()).toContain("Browse");
    });

    test("toolbar is visible with sort tabs and search", async ({ page }) => {
      await page.goto("/browse");

      await expect(page.getByTestId("browse-toolbar")).toBeVisible();
      await expect(page.getByTestId("sort-recent")).toBeVisible();
      await expect(page.getByTestId("sort-price_asc")).toBeVisible();
      await expect(page.getByTestId("sort-price_desc")).toBeVisible();
      await expect(page.getByTestId("browse-search")).toBeVisible();
    });
  });

  test.describe("Toolbar interactions", () => {
    test("sort tabs change URL and trigger fetch", async ({ page }) => {
      const requests: string[] = [];
      await page.route("**/api/v1/public/listings?*", async (route) => {
        requests.push(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: MOCK_LISTINGS, next_cursor: null }),
        });
      });

      await page.goto("/browse");

      // Click price ascending sort (bypass nextjs-portal with DOM click)
      await domClick(page, "sort-price_asc");
      await page.waitForTimeout(500);

      expect(page.url()).toContain("sort=price_asc");
      const sortRequest = requests.find((url) => url.includes("sort=price_asc"));
      expect(sortRequest).toBeTruthy();
    });

    test("search input updates URL after debounce", async ({ page }) => {
      await mockClientFetch(page);
      await page.goto("/browse");

      await page.getByTestId("browse-search").fill("laptop");
      // Wait for debounce (300ms) + URL update
      await page.waitForTimeout(600);

      expect(page.url()).toContain("q=laptop");
    });

    test("condition pills toggle filter and update URL", async ({ page }) => {
      await mockClientFetch(page);
      await page.goto("/browse");

      // Click NEW condition pill
      await domClick(page, "condition-NEW");
      await page.waitForURL((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get("condition") === "NEW";
      }, { timeout: 5_000 });

      // Click again to deselect
      await domClick(page, "condition-NEW");
      await page.waitForURL((url) => {
        const parsed = new URL(url);
        return !parsed.searchParams.has("condition");
      }, { timeout: 5_000 });
    });

    test("clear filters button resets all filters", async ({ page }) => {
      await mockClientFetch(page);
      await page.goto("/browse");

      // Set condition filter and wait for URL to sync
      await domClick(page, "condition-NEW");
      await page.waitForURL(/condition=NEW/, { timeout: 5_000 });

      // Clear filters button should appear
      await expect(page.getByTestId("browse-clear-filters")).toBeVisible();
      await domClick(page, "browse-clear-filters");

      // Wait for URL to clear (condition is set immediately, not debounced)
      await page.waitForFunction(() => !window.location.search.includes("condition="), { timeout: 5_000 });
      expect(page.url()).not.toContain("condition=");
    });

    test("verifies cover image DOM markers per listing card after client fetch", async ({ page }) => {
      await page.goto("/browse");
      await page.waitForTimeout(500);

      const listingsWithCoverStates = [
        {
          ...MOCK_LISTINGS[0],
          listing_id: "cover-listing-1111-2222-3333-444444444444",
          title: "Listing With Cover",
          cover_image: {
            storage_key: "https://cdn.example.com/public/listings/cover.jpg",
            mime: "image/jpeg",
          },
        },
        {
          ...MOCK_LISTINGS[1],
          listing_id: "cover-listing-5555-6666-7777-888888888888",
          title: "Listing Without Cover",
          cover_image: null,
        },
      ];

      await mockClientFetch(page, { items: listingsWithCoverStates });
      await domClick(page, "sort-price_asc");

      await expect(page.getByText("Listing With Cover")).toBeVisible({ timeout: 10_000 });

      const cards = page.locator('[data-testid="browse-grid"] article');
      await expect(cards).toHaveCount(2);

      const firstCard = cards.nth(0);
      await expect(firstCard.getByTestId("listing-cover-zone")).toHaveCount(1);
      await expect(firstCard.getByTestId("listing-cover-image")).toHaveCount(1);

      const secondCard = cards.nth(1);
      await expect(secondCard.getByTestId("listing-cover-zone")).toHaveCount(0);
      await expect(secondCard.getByTestId("listing-cover-image")).toHaveCount(0);
    });
  });

  test.describe("Client-side fetch states", () => {
    test("shows empty state after filter yields no results", async ({ page }) => {
      // First let SSR load real data, then mock client-side to return empty
      await page.goto("/browse");

      // Wait for initial content
      await page.waitForTimeout(500);

      // Now mock client-side to return empty
      await mockClientFetch(page, { items: [] });

      // Trigger a client-side fetch by changing condition
      await domClick(page, "condition-POOR");

      await expect(page.getByTestId("browse-empty")).toBeVisible({ timeout: 10_000 });
    });

    test("shows error state after client-side fetch failure", async ({ page }) => {
      await page.goto("/browse");
      await page.waitForTimeout(500);

      // Mock client-side to return error
      await mockClientFetch(page, { status: 500, error: "Server error" });

      // Trigger a client-side fetch
      await domClick(page, "sort-price_asc");

      await expect(page.getByTestId("browse-error")).toBeVisible({ timeout: 10_000 });
    });

    test("retry button re-fetches after error", async ({ page }) => {
      await page.goto("/browse");
      await page.waitForTimeout(500);

      // First: fail
      await mockClientFetch(page, { status: 500, error: "Temporary error" });
      await domClick(page, "sort-price_asc");
      await expect(page.getByTestId("browse-error")).toBeVisible({ timeout: 10_000 });

      // Now: succeed on retry
      await page.unrouteAll();
      await mockClientFetch(page);
      await domClick(page, "browse-retry");

      await expect(page.getByTestId("browse-grid")).toBeVisible({ timeout: 10_000 });
    });

    test("reset filters button appears in empty state", async ({ page }) => {
      await page.goto("/browse");
      await page.waitForTimeout(500);

      await mockClientFetch(page, { items: [] });
      await domClick(page, "condition-POOR");

      await expect(page.getByTestId("browse-empty")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("browse-reset-filters")).toBeVisible();
    });
  });

  test.describe("Pagination", () => {
    test("load more button appears with next_cursor and appends listings", async ({ page }) => {
      await page.goto("/browse");
      await page.waitForTimeout(500);

      let callCount = 0;
      await page.route("**/api/v1/public/listings?*", async (route) => {
        callCount++;
        if (callCount === 1) {
          // Sort change → return 1 item with cursor
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [MOCK_LISTINGS[0]],
              next_cursor: "page-2-cursor",
            }),
          });
        } else {
          // Load more → return second item
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [MOCK_LISTINGS[1]],
              next_cursor: null,
            }),
          });
        }
      });

      // Trigger client-side fetch
      await domClick(page, "sort-price_asc");

      await expect(page.getByTestId("browse-load-more")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Test Laptop Mock")).toBeVisible();

      // Click load more
      await domClick(page, "browse-load-more");

      await expect(page.getByText("Used Keyboard Mock")).toBeVisible({ timeout: 10_000 });
      // First item still present
      await expect(page.getByText("Test Laptop Mock")).toBeVisible();
      // Load more button should be gone
      await expect(page.getByTestId("browse-load-more")).not.toBeVisible();
    });
  });
});
