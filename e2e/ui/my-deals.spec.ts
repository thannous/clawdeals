import { test, expect, type Page } from "@playwright/test";
import { waitForApiGet } from "./helpers/api";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const AGENT_ID = "aaaa-1111-2222-3333-444444444444";

const MOCK_DEALS = [
  {
    deal_id: "deal-1111-2222-3333-444444444444",
    title: "GPU RTX 4090 Discount",
    status: "NEW",
    temperature: null,
    price: 89999,
    currency: "EUR",
    created_at: new Date().toISOString(),
    creator_agent_id: AGENT_ID
  },
  {
    deal_id: "deal-2222-3333-4444-555555555555",
    title: "Steam Deck OLED 50% Off",
    status: "ACTIVE",
    temperature: 72,
    price: 22999,
    currency: "EUR",
    created_at: new Date().toISOString(),
    creator_agent_id: AGENT_ID
  },
  {
    deal_id: "deal-3333-4444-5555-666666666666",
    title: "Expired Deal Example",
    status: "EXPIRED",
    temperature: 10,
    price: 500,
    currency: "USD",
    created_at: new Date().toISOString(),
    creator_agent_id: "bbbb-1111-2222-3333-444444444444"
  }
];

const MOCK_CURSOR = "eyJjcmVhdGVkX2F0IjoiMjAyNi0wMS0wMVQwMDowMDowMFoiLCJkZWFsX2lkIjoiZGVhbC0xIn0=";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOwnerDealsApi(
  page: Page,
  {
    items = MOCK_DEALS,
    next_cursor = null as string | null,
    status = 200,
    delay = 0,
    error = null as string | null
  } = {}
) {
  return page.route("**/api/v1/owner/deals?*", async (route) => {
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
      body: JSON.stringify({ data: { deals: items, next_cursor } })
    });
  });
}

function mockOwnerAgentsApi(page: Page) {
  return page.route("**/api/v1/owner/agents*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          agents: [
            { id: AGENT_ID, name: "Test Agent" },
            { id: "bbbb-1111-2222-3333-444444444444", name: "Other Agent" }
          ]
        }
      })
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("My Deals page", () => {
  test.beforeEach(async ({ page }) => {
    // Owner pages probe the session before loading data; pretend an owner is signed in.
    await page.route("**/api/v1/auth/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { authenticated: true, owner_id: "11111111-1111-4111-a111-111111111111" } })
      });
    });
  });

  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------
  test.describe("List view", () => {
    test("renders deals table with correct data", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page);
      await page.goto("/my/deals");

      await expect(page.getByTestId("my-deals-page")).toBeVisible();
      const rows = page.locator("table tbody tr");
      await expect(rows).toHaveCount(3);

      await expect(rows.nth(0)).toContainText("GPU RTX 4090 Discount");
      await expect(rows.nth(1)).toContainText("Steam Deck OLED 50% Off");
    });

    test("shows loading skeleton while fetching", async ({ page }) => {
      await mockOwnerAgentsApi(page);

      let release: (() => void) | null = null;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const apiRequest = page.waitForRequest(
        (req) => req.method() === "GET" && req.url().includes("/api/v1/owner/deals")
      );

      await page.route("**/api/v1/owner/deals?*", async (route) => {
        await gate;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { deals: MOCK_DEALS, next_cursor: null } })
        });
      });

      const nav = page.goto("/my/deals", { waitUntil: "domcontentloaded" });

      await apiRequest;
      await expect(page.getByTestId("my-deals-page").locator(".animate-pulse")).toBeVisible({ timeout: 20_000 });

      release?.();
      await nav;
    });

    test("shows empty state when no deals", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page, { items: [] });
      await page.goto("/my/deals");

      await expect(page.getByText("No deals found")).toBeVisible();
    });

    test("shows error state on API failure", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page, { status: 500, error: "Server error" });
      await page.goto("/my/deals");

      await expect(page.getByText("Server error")).toBeVisible();
      await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------
  test.describe("Filters", () => {
    test("filters by status NEW", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await page.route("**/api/v1/owner/deals?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { deals: MOCK_DEALS, next_cursor: null } })
        });
      });

      await page.goto("/my/deals");
      await expect(page.getByTestId("my-deals-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/v1/owner/deals", { status: "NEW" });
      await page.getByTestId("my-deals-toolbar").getByRole("button", { name: /^New$/ }).click();
      const req = await reqPromise;
      expect(new URL(req.url()).searchParams.get("status")).toBe("NEW");
    });

    test("filters by status ACTIVE", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await page.route("**/api/v1/owner/deals?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { deals: MOCK_DEALS, next_cursor: null } })
        });
      });

      await page.goto("/my/deals");
      await expect(page.getByTestId("my-deals-page")).toBeVisible();

      const reqPromise = waitForApiGet(page, "/api/v1/owner/deals", { status: "ACTIVE" });
      await page.getByTestId("my-deals-toolbar").getByRole("button", { name: /^Active$/ }).click();
      const req = await reqPromise;
      expect(new URL(req.url()).searchParams.get("status")).toBe("ACTIVE");
    });

    test("filter state persists in URL query params", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page);
      await page.goto("/my/deals");
      await expect(page.getByTestId("my-deals-page")).toBeVisible();

      await page.getByTestId("my-deals-toolbar").getByRole("button", { name: /^Active$/ }).click();
      await page.waitForTimeout(400);

      expect(page.url()).toContain("status=ACTIVE");
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------
  test.describe("Pagination", () => {
    test("shows Load More button when next_cursor exists", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page, { next_cursor: MOCK_CURSOR });
      await page.goto("/my/deals");

      await expect(page.getByTestId("my-deals-page")).toBeVisible();
      await expect(page.getByRole("button", { name: /load more/i })).toBeVisible();
    });

    test("appends results on Load More click", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      let callCount = 0;
      await page.route("**/api/v1/owner/deals?*", (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: { deals: MOCK_DEALS.slice(0, 2), next_cursor: MOCK_CURSOR } })
          });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { deals: MOCK_DEALS.slice(2), next_cursor: null } })
        });
      });

      await page.goto("/my/deals");
      await expect(page.locator("table tbody tr")).toHaveCount(2);

      await page.getByRole("button", { name: /load more/i }).click();
      await expect(page.locator("table tbody tr")).toHaveCount(3);
    });
  });

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------
  test.describe("Navigation", () => {
    test("AppNav shows Deals as active", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page);
      await page.goto("/my/deals");

      await expect(page.getByTestId("my-deals-page")).toBeVisible();
      const dealsNavLink = page.getByTestId("app-nav").locator('a[href="/my/deals"]');
      await expect(dealsNavLink).toBeVisible();
      await expect(dealsNavLink).toHaveAttribute("aria-current", "page");
    });

    test("redirects to login on 401", async ({ page }) => {
      await mockOwnerAgentsApi(page);
      await mockOwnerDealsApi(page, { status: 401, error: "Unauthorized" });

      await page.goto("/my/deals");
      await page.waitForURL("**/auth/login**", { timeout: 10_000 });
      expect(page.url()).toContain("/auth/login");
      expect(page.url()).toContain("next=");
    });
  });
});
