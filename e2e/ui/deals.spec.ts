import { expect, test, type Page } from "@playwright/test";

const MOCK_DEAL = {
  deal_id: "aaaa-1111-2222-3333-444444444444",
  title: "Owner deal",
  price: 19.99,
  currency: "EUR",
  status: "ACTIVE",
  temperature: 72,
  creator_agent_id: "bbbb-1111-2222-3333-444444444444",
  created_at: "2026-09-03T08:00:00.000Z"
};

function mockOwnerAgentsApi(page: Page) {
  return page.route("**/api/v1/owner/agents*", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          agents: [
            {
              agent_id: MOCK_DEAL.creator_agent_id,
              name: "Owner agent"
            }
          ]
        }
      })
    });
  });
}

test.describe("Deals owner entry point", () => {
  test("redirects an anonymous visitor to login without exposing console errors", async ({ page }) => {
    const consoleRequests: string[] = [];
    await page.route("**/api/console/**", (route) => {
      consoleRequests.push(route.request().url());
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "Owner is not allowlisted for console ops"
          }
        })
      });
    });
    await page.route("**/api/v1/owner/deals?*", (route) => {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Owner authentication required"
          }
        })
      });
    });
    await page.route("**/api/v1/owner/agents*", (route) => {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UNAUTHORIZED" } })
      });
    });

    await page.goto("/deals");
    await page.waitForURL(/\/auth\/login\?next=%2Fdeals$/);

    expect(new URL(page.url()).pathname).toBe("/auth/login");
    expect(new URL(page.url()).search).toBe("?next=%2Fdeals");
    expect(consoleRequests).toEqual([]);
    await expect(page.getByText(/allowlisted|console ops/i)).toHaveCount(0);
  });

  test("renders the authenticated owner's deals without calling console APIs", async ({ page }) => {
    const consoleRequests: string[] = [];
    await page.route("**/api/console/**", (route) => {
      consoleRequests.push(route.request().url());
      return route.abort();
    });
    // Owner pages probe the session (TI-497) before loading data: pretend an owner is signed in.
    await page.route("**/api/v1/auth/session", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { authenticated: true, owner_id: "11111111-1111-4111-a111-111111111111" } })
      });
    });
    await mockOwnerAgentsApi(page);
    await page.route("**/api/v1/owner/deals?*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            deals: [MOCK_DEAL],
            next_cursor: null
          }
        })
      });
    });

    await page.goto("/deals");

    await expect(page.getByTestId("my-deals-page")).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(1);
    await expect(page.locator("table tbody tr").first()).toContainText("Owner deal");
    expect(consoleRequests).toEqual([]);
    await expect(page.getByText(/allowlisted|console ops/i)).toHaveCount(0);
  });
});
