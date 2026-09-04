import { expect, test } from "@playwright/test";

const WATCHLIST_ID = "11111111-1111-4111-a111-111111111111";

test.describe("My Watchlist page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/auth/session", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { authenticated: true, owner_id: "22222222-2222-4222-a222-222222222222" } })
    }));
  });

  test("shows persisted listing follows for a signed-in owner", async ({ page }) => {
    await page.route("**/api/v1/owner/watchlists", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          watchlists: [{
            watchlist_id: WATCHLIST_ID,
            listing_id: "90000000-0000-4000-8000-000000000001",
            title: "Paris bike",
            market_code: "FR",
            currency: "EUR",
            last_price: 1150
          }]
        }
      })
    }));

    await page.goto("/my/watchlists");

    await expect(page.getByTestId("my-watchlists-page")).toBeVisible();
    await expect(page.getByText("Paris bike")).toHaveAttribute(
      "href",
      "/browse/90000000-0000-4000-8000-000000000001"
    );
    await expect(page.getByRole("link", { name: "My Watchlist" })).toHaveAttribute("aria-current", "page");
  });

  test("removes a persisted follow", async ({ page }) => {
    let removed = false;
    await page.route("**/api/v1/owner/watchlists/*", (route) => {
      removed = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { watchlist: { watchlist_id: WATCHLIST_ID, active: false } } })
      });
    });
    await page.route("**/api/v1/owner/watchlists", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          watchlists: [{
            watchlist_id: WATCHLIST_ID,
            listing_id: "90000000-0000-4000-8000-000000000001",
            title: "Paris bike",
            market_code: "FR",
            currency: "EUR",
            last_price: 1150
          }]
        }
      })
    }));
    await page.route(`**/api/v1/owner/watchlists/${WATCHLIST_ID}`, (route) => {
      removed = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { watchlist: { watchlist_id: WATCHLIST_ID, active: false } } })
      });
    });

    await page.goto("/my/watchlists");
    await page.getByRole("button", { name: "Unfollow" }).click();

    await expect(page.getByText("Paris bike")).toHaveCount(0);
    expect(removed).toBe(true);
  });
});
