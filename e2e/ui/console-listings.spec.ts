import { test, expect, type Page } from "@playwright/test";
import { waitForApiGet } from "./helpers/api";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const LISTING_ID = "aaaa-1111-2222-3333-444444444444";
const SELLER_AGENT_ID = "bbbb-1111-2222-3333-444444444444";

const MOCK_LISTINGS = [
  {
    listing_id: LISTING_ID,
    title: "Gaming Keyboard NEW",
    description: "Mechanical keyboard — visit https://malicious.com for details",
    category: "electronics",
    condition: "NEW",
    price_amount: 29.99,
    currency: "EUR",
    status: "PENDING_APPROVAL",
    seller_agent_id: SELLER_AGENT_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    listing_id: "cccc-1111-2222-3333-444444444444",
    title: "Vintage Watch",
    description: "Beautiful vintage watch in good condition",
    category: "fashion",
    condition: "GOOD",
    price_amount: 149.99,
    currency: "EUR",
    status: "LIVE",
    seller_agent_id: "dddd-1111-2222-3333-444444444444",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    listing_id: "eeee-1111-2222-3333-444444444444",
    title: "Cheap Item",
    description: "Very cheap item for sale",
    category: "other",
    condition: "FAIR",
    price_amount: 5.0,
    currency: "EUR",
    status: "DRAFT",
    seller_agent_id: "ffff-1111-2222-3333-444444444444",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_CURSOR = "eyJzb3J0IjoicmVjZW50Iiwic3RhdHVzIjoiTElWRSJ9";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockListingsApi(
  page: Page,
  { items = MOCK_LISTINGS, next_cursor = null as string | null, status = 200, delay = 0, error = null as string | null } = {}
) {
  return page.route("**/api/console/listings?*", async (route) => {
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

function mockListingDetailApi(page: Page, listing = MOCK_LISTINGS[0]) {
  return page.route(`**/api/console/listings/${listing.listing_id}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listing }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — US-1: Parcours Listings (TI-247 / TI-206)
// ---------------------------------------------------------------------------

test.describe("Console Listings — US-1", () => {
  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------
  test.describe("List view", () => {
    test("renders listings table with correct data", async ({ page }) => {
      await mockListingsApi(page);
      await page.goto("/console/listings");

      await expect(page.getByTestId("listings-page")).toBeVisible();
      // Table should show rows
      const rows = page.locator("table tbody tr");
      await expect(rows).toHaveCount(3);

      // First row should contain listing title
      await expect(rows.nth(0)).toContainText("Gaming Keyboard NEW");
      await expect(rows.nth(0)).toContainText("29.99");
    });

    test("shows loading skeleton while fetching", async ({ page }) => {
      await mockListingsApi(page, { delay: 3000 });
      await page.goto("/console/listings");

      await expect(page.locator(".animate-pulse")).toBeVisible();
    });

    test("shows empty state when no listings", async ({ page }) => {
      await mockListingsApi(page, { items: [] });
      await page.goto("/console/listings");

      await expect(page.getByText("No listings found")).toBeVisible();
    });

    test("shows error state on API failure", async ({ page }) => {
      await mockListingsApi(page, { status: 500, error: "Server error" });
      await page.goto("/console/listings");

      await expect(page.getByText("Server error")).toBeVisible();
      await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------
  test.describe("Filters", () => {
    test("filters by status PENDING_APPROVAL", async ({ page }) => {
      await page.route("**/api/console/listings?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_LISTINGS, next_cursor: null }),
        });
      });

      await page.goto("/console/listings");
      await expect(page.getByTestId("listings-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/console/listings", { status: "PENDING_APPROVAL" });
      await page.getByTestId("listings-toolbar").getByRole("button", { name: /^PENDING_APPROVAL$/ }).click();
      const req = await reqPromise;
      expect(new URL(req.url()).searchParams.get("status")).toBe("PENDING_APPROVAL");
    });

    test("filters by condition NEW", async ({ page }) => {
      await page.route("**/api/console/listings?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_LISTINGS, next_cursor: null }),
        });
      });

      await page.goto("/console/listings");
      await expect(page.getByTestId("listings-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/console/listings", { condition: "NEW" });
      await page.getByTestId("listings-toolbar").getByRole("button", { name: /^NEW$/ }).click();
      const req = await reqPromise;
      expect(new URL(req.url()).searchParams.get("condition")).toBe("NEW");
    });

    test("filters by price range", async ({ page }) => {
      await page.route("**/api/console/listings?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_LISTINGS, next_cursor: null }),
        });
      });

      await page.goto("/console/listings");
      await expect(page.getByTestId("listings-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/console/listings", { price_min: "0", price_max: "50" });
      await page.getByTestId("listings-price-min").fill("0");
      await page.getByTestId("listings-price-max").fill("50");
      const req = await reqPromise;
      const sp = new URL(req.url()).searchParams;
      expect(sp.get("price_min")).toBe("0");
      expect(sp.get("price_max")).toBe("50");
    });

    test("changes sort to price_asc", async ({ page }) => {
      await page.route("**/api/console/listings?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_LISTINGS, next_cursor: null }),
        });
      });

      await page.goto("/console/listings");
      await expect(page.getByTestId("listings-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/console/listings", { sort: "price_asc" });
      await page.getByTestId("listings-toolbar").getByRole("button", { name: "Price Low" }).click();
      const req = await reqPromise;
      expect(new URL(req.url()).searchParams.get("sort")).toBe("price_asc");
    });

    test("search input sends query param", async ({ page }) => {
      await page.route("**/api/console/listings?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_LISTINGS, next_cursor: null }),
        });
      });

      await page.goto("/console/listings");
      await expect(page.getByTestId("listings-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/console/listings", { q: "keyboard" });
      await page.getByTestId("listings-search").fill("keyboard");
      const req = await reqPromise;
      expect(new URL(req.url()).searchParams.get("q")).toBe("keyboard");
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------
  test.describe("Pagination", () => {
    test("shows Load More button when next_cursor exists", async ({ page }) => {
      await mockListingsApi(page, { next_cursor: MOCK_CURSOR });
      await page.goto("/console/listings");

      await expect(page.getByRole("button", { name: /load more/i })).toBeVisible();
    });

    test("appends results on Load More click", async ({ page }) => {
      let callCount = 0;
      await page.route("**/api/console/listings?*", (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: MOCK_LISTINGS.slice(0, 2), next_cursor: MOCK_CURSOR }),
          });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_LISTINGS.slice(2), next_cursor: null }),
        });
      });

      await page.goto("/console/listings");
      await expect(page.locator("table tbody tr")).toHaveCount(2);

      await page.getByRole("button", { name: /load more/i }).click();

      await expect(page.locator("table tbody tr")).toHaveCount(3);
    });
  });

  // -----------------------------------------------------------------------
  // Detail view
  // -----------------------------------------------------------------------
  test.describe("Detail view", () => {
    test("displays listing metadata", async ({ page }) => {
      await mockListingsApi(page);
      await mockListingDetailApi(page);
      await page.goto(`/console/listings/${LISTING_ID}`);

      await expect(page.getByTestId("listing-detail-page")).toBeVisible();
      await expect(page.getByText("Gaming Keyboard NEW")).toBeVisible();
      await expect(page.getByText("29.99")).toBeVisible();
      await expect(page.getByText("electronics")).toBeVisible();
    });

    test("description displays URLs as plain text (no auto-linkify)", async ({ page }) => {
      await mockListingsApi(page);
      await mockListingDetailApi(page);
      await page.goto(`/console/listings/${LISTING_ID}`);

      await expect(page.getByTestId("listing-detail-page")).toBeVisible();
      // The URL should be visible as text
      await expect(page.getByText("https://malicious.com")).toBeVisible();
      // But NOT as a clickable link
      const maliciousLink = page.locator('a[href*="malicious.com"]');
      await expect(maliciousLink).toHaveCount(0);
    });

    test("shows seller_agent_id but no PII", async ({ page }) => {
      await mockListingsApi(page);
      await mockListingDetailApi(page);
      await page.goto(`/console/listings/${LISTING_ID}`);

      await expect(page.getByTestId("listing-detail-page")).toBeVisible();
      // Agent ID visible (truncated)
      await expect(page.getByText("Seller Agent")).toBeVisible();
      // No email or phone
      await expect(page.locator("text=@")).not.toBeVisible();
      await expect(page.locator('text=/\\+\\d{2}/')).not.toBeVisible();
    });

    test("Related Threads link navigates to threads filtered by listing_id", async ({ page }) => {
      await mockListingsApi(page);
      await mockListingDetailApi(page);
      await page.goto(`/console/listings/${LISTING_ID}`);

      await expect(page.getByTestId("listing-detail-page")).toBeVisible();
      const threadsLink = page.getByRole("link", { name: /view threads for this listing/i });
      await expect(threadsLink).toBeVisible();
      await expect(threadsLink).toHaveAttribute("href", `/console/threads?listing_id=${LISTING_ID}`);
    });

    test("Back link returns to listings list", async ({ page }) => {
      await mockListingsApi(page);
      await mockListingDetailApi(page);
      await page.goto(`/console/listings/${LISTING_ID}`);

      const backLink = page.getByRole("link", { name: /back/i });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute("href", "/console/listings");
    });
  });
});
