import { test, expect, type Page } from "@playwright/test";

const MOCK_DEALS = [
  {
    deal_id: "aaaa-deal-1111-2222-333333333333",
    title: "GPU RTX 5090 Flash Sale",
    source_url: "https://example.com/gpu-sale",
    price: 89900,
    currency: "USD",
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    tags: ["gpu", "nvidia"],
    status: "ACTIVE",
    temperature: 75,
    votes_up: 12,
    votes_down: 2,
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
  {
    deal_id: "bbbb-deal-1111-2222-333333333333",
    title: "Mechanical Keyboard Deal",
    source_url: "https://shop.example.org/keyboard",
    price: 4500,
    currency: "EUR",
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    tags: ["keyboard"],
    status: "NEW",
    temperature: null,
    votes_up: 0,
    votes_down: 0,
    created_at: new Date(Date.now() - 600 * 1000).toISOString(),
  },
];

/** Bypass Next.js dev overlay (<nextjs-portal>) by using DOM click */
async function domClick(page: Page, testId: string) {
  await page.getByTestId(testId).evaluate((el) => (el as HTMLButtonElement).click());
}

/**
 * Mock the public deals API for client-side fetches.
 * Note: SSR calls happen server-side and cannot be intercepted.
 */
function mockClientFetch(
  page: Page,
  {
    items = MOCK_DEALS,
    next_cursor = null as string | null,
    status = 200,
    error = null as string | null,
  } = {}
) {
  return page.route("**/api/v1/public/deals?*", async (route) => {
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

test.describe("Browse Deals page", () => {
  test.describe("Initial SSR render", () => {
    test("page loads with SSR data and shows deals or empty state", async ({ page }) => {
      await page.goto("/browse/deals");

      // The page should have loaded — either deals grid or empty state
      const grid = page.getByTestId("browse-deals-grid");
      const empty = page.getByTestId("browse-deals-empty");
      const either = await Promise.race([
        grid.waitFor({ timeout: 10_000 }).then(() => "grid"),
        empty.waitFor({ timeout: 10_000 }).then(() => "empty"),
      ]);

      expect(["grid", "empty"]).toContain(either);
    });

    test("page title and heading are present", async ({ page }) => {
      await page.goto("/browse/deals");

      await expect(page.locator("h1")).toBeVisible();
      expect(await page.title()).toContain("Price alerts");
    });

    test("toolbar is visible with sort tabs and search", async ({ page }) => {
      await page.goto("/browse/deals");

      await expect(page.getByTestId("browse-deals-toolbar")).toBeVisible();
      await expect(page.getByTestId("sort-new")).toBeVisible();
      await expect(page.getByTestId("sort-temp")).toBeVisible();
      await expect(page.getByTestId("sort-trend")).toBeVisible();
      await expect(page.getByTestId("browse-deals-search")).toBeVisible();
    });
  });

  test.describe("Toolbar interactions", () => {
    test("sort tabs change URL and trigger fetch", async ({ page }) => {
      const requests: string[] = [];
      await page.route("**/api/v1/public/deals?*", async (route) => {
        requests.push(route.request().url());
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: MOCK_DEALS, next_cursor: null }),
        });
      });

      await page.goto("/browse/deals");

      // Click temp sort
      await domClick(page, "sort-temp");
      await page.waitForURL((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get("sort") === "temp";
      }, { timeout: 5_000 });

      await expect.poll(() => requests.some((url) => url.includes("sort=temp"))).toBe(true);
    });

    test("search input updates URL after debounce", async ({ page }) => {
      await mockClientFetch(page);
      await page.goto("/browse/deals");

      await page.getByTestId("browse-deals-search").fill("gpu");
      // Wait for debounce (300ms) + URL update
      await page.waitForTimeout(600);

      expect(page.url()).toContain("q=gpu");
    });

    test("status pills toggle filter and update URL", async ({ page }) => {
      await mockClientFetch(page);
      await page.goto("/browse/deals");

      // Click ACTIVE status pill
      await domClick(page, "status-ACTIVE");
      await page.waitForURL((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get("status") === "ACTIVE";
      }, { timeout: 5_000 });

      // Click again to deselect
      await domClick(page, "status-ACTIVE");
      await page.waitForURL((url) => {
        const parsed = new URL(url);
        return !parsed.searchParams.has("status");
      }, { timeout: 5_000 });
    });

    test("clear filters button resets status filter", async ({ page }) => {
      await mockClientFetch(page);
      await page.goto("/browse/deals");

      // Set status filter
      await domClick(page, "status-NEW");
      await page.waitForURL(/status=NEW/, { timeout: 5_000 });

      // Clear filters button should appear
      await expect(page.getByTestId("browse-deals-clear-filters")).toBeVisible();
      await domClick(page, "browse-deals-clear-filters");

      await page.waitForFunction(() => !window.location.search.includes("status="), { timeout: 5_000 });
      expect(page.url()).not.toContain("status=");
    });

    test("verifies cover image DOM markers per deal card after client fetch", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      const dealsWithCoverStates = [
        {
          ...MOCK_DEALS[0],
          deal_id: "public-cover-deal-1111-2222-333333333333",
          title: "Public Deal With Cover",
          cover_image: {
            storage_key: "https://cdn.example.com/public/deals/cover.jpg",
            mime: "image/jpeg",
          },
        },
        {
          ...MOCK_DEALS[1],
          deal_id: "public-cover-deal-4444-5555-666666666666",
          title: "Public Deal Without Cover",
          cover_image: null,
        },
      ];

      await mockClientFetch(page, { items: dealsWithCoverStates });
      await domClick(page, "sort-temp");

      const cards = page.locator('[data-testid="browse-deals-grid"] article');
      await expect(cards).toHaveCount(2);

      const firstCard = cards.nth(0);
      await expect(firstCard.getByTestId("browse-deal-cover-zone")).toHaveCount(1);
      await expect(firstCard.getByTestId("browse-deal-cover-image")).toHaveCount(1);

      const secondCard = cards.nth(1);
      await expect(secondCard.getByTestId("browse-deal-cover-zone")).toHaveCount(0);
      await expect(secondCard.getByTestId("browse-deal-cover-image")).toHaveCount(0);
    });
  });

  test.describe("Client-side fetch states", () => {
    test("shows empty state after filter yields no results", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      await mockClientFetch(page, { items: [] });
      await domClick(page, "status-EXPIRED");

      await expect(page.getByTestId("browse-deals-empty")).toBeVisible({ timeout: 10_000 });
    });

    test("shows error state after client-side fetch failure", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      await mockClientFetch(page, { status: 500, error: "Server error" });
      await domClick(page, "sort-temp");

      await expect(page.getByTestId("browse-deals-error")).toBeVisible({ timeout: 10_000 });
    });

    test("retry button re-fetches after error", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      // First: fail
      await mockClientFetch(page, { status: 500, error: "Temporary error" });
      await domClick(page, "sort-temp");
      await expect(page.getByTestId("browse-deals-error")).toBeVisible({ timeout: 10_000 });

      // Now: succeed on retry
      await page.unrouteAll();
      await mockClientFetch(page);
      await domClick(page, "browse-deals-retry");

      await expect(page.getByTestId("browse-deals-grid")).toBeVisible({ timeout: 10_000 });
    });

    test("reset filters button appears in empty state", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      await mockClientFetch(page, { items: [] });
      await domClick(page, "status-EXPIRED");

      await expect(page.getByTestId("browse-deals-empty")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("browse-deals-reset-filters")).toBeVisible();
    });
  });

  test.describe("Pagination", () => {
    test("load more button appears with next_cursor and appends deals", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      let callCount = 0;
      await page.route("**/api/v1/public/deals?*", async (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [MOCK_DEALS[0]],
              next_cursor: "page-2-cursor",
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [MOCK_DEALS[1]],
              next_cursor: null,
            }),
          });
        }
      });

      // Trigger client-side fetch
      await domClick(page, "sort-temp");

      await expect(page.getByTestId("browse-deals-load-more")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("GPU RTX 5090 Flash Sale")).toBeVisible();

      // Click load more
      await domClick(page, "browse-deals-load-more");

      await expect(page.getByText("Mechanical Keyboard Deal")).toBeVisible({ timeout: 10_000 });
      // First item still present
      await expect(page.getByText("GPU RTX 5090 Flash Sale")).toBeVisible();
      // Load more button should be gone
      await expect(page.getByTestId("browse-deals-load-more")).not.toBeVisible();
    });
  });

  test.describe("Navigation", () => {
    test("clicking a public deal card navigates to /browse/deals/:id", async ({ page }) => {
      await page.goto("/browse/deals");
      await page.waitForTimeout(500);

      await page.route("**/api/v1/public/deals?*", async (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                ...MOCK_DEALS[0],
                deal_id: "11111111-1111-4111-8111-111111111111",
              },
            ],
            next_cursor: null,
          }),
        });
      });

      await domClick(page, "sort-temp");
      await expect(page.locator('[data-testid="browse-deals-grid"] article').first()).toBeVisible({ timeout: 10_000 });

      await page.locator('[data-testid="browse-deals-grid"] article').first().click();
      await expect(page).toHaveURL(/\/browse\/deals\/[^/?#]+/, { timeout: 30_000 });
    });

    test("legacy deals detail URL with browse marker redirects to public route", async ({ page }) => {
      const dealId = "22222222-2222-4222-8222-222222222222";
      await page.goto(`/deals/${dealId}?from=browse-deals`);
      await expect(page).toHaveURL(`/browse/deals/${dealId}`);
    });
  });
});
