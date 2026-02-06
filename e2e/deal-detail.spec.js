const { test, expect } = require("@playwright/test");

const DEAL_ID = "aaaa-1111-2222-3333-444444444444";

const MOCK_DEALS = [
  {
    deal_id: DEAL_ID,
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
  }
];

test.describe("Deal detail page", () => {
  test("opens from feed, shows reasons + notes, no auto-link in text fields", async ({ page }) => {
    // Feed list
    await page.route("**/api/console/deals?*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_DEALS, next_cursor: null })
      });
    });

    // Deal detail
    await page.route(`**/api/console/deals/${DEAL_ID}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deal: {
            ...MOCK_DEALS[0],
            status: "ACTIVE",
            temperature: 72,
            votes_up: 12,
            votes_down: 3
          }
        })
      });
    });

    // Reasons: 2 pages (serve page2 only when cursor is present to avoid StrictMode double-fetch flakiness)
    await page.route(`**/api/console/deals/${DEAL_ID}/votes?*`, (route) => {
      const url = route.request().url();
      const hasCursor = url.includes("cursor=");
      if (!hasCursor) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                direction: "up",
                reason: "Great price http://example.com (should not be a link)",
                weight: 0.72,
                created_at: new Date().toISOString()
              }
            ],
            next_cursor: "cursor-1"
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              direction: "down",
              reason: "Not sure about stock",
              weight: 0.5,
              created_at: new Date().toISOString()
            }
          ],
          next_cursor: null
        })
      });
    });

    // Notes list
    await page.route(`**/api/console/deals/${DEAL_ID}/comments?*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], next_cursor: null })
      });
    });

    // Notes create
    await page.route(`**/api/console/deals/${DEAL_ID}/comments`, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.fallback();
      }
      const body = JSON.parse(request.postData() || "{}");
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          comment: {
            deal_comment_id: "note-1",
            deal_id: DEAL_ID,
            comment_type: body.comment_type || "note",
            body: body.body,
            author: { type: "human" },
            created_at: new Date().toISOString()
          }
        })
      });
    });

    await page.goto("/deals");
    await expect(page.getByTestId("deals-list")).toBeVisible();

    // Open detail from feed
    await page.getByTestId("deal-detail-link").first().click();
    await expect(page).toHaveURL(new RegExp(`/deals/${DEAL_ID}$`));
    await expect(page.getByTestId("deal-detail-page")).toBeVisible();
    await expect(page.getByTestId("deal-title")).toContainText("Test Deal NEW");
    await expect(page.getByTestId("deal-open-source")).toHaveAttribute("rel", /noopener/);

    // Reasons default tab
    await expect(page.getByTestId("reasons-tab")).toBeVisible();
    await expect(page.getByTestId("reasons-list")).toBeVisible();
    await expect(page.getByTestId("reasons-list")).toContainText("Great price");

    // No auto-link in reason text
    await expect(page.locator('[data-testid="reasons-list"] a')).toHaveCount(0);

    // Pagination
    await page.getByTestId("reasons-load-more").click();
    await expect(page.getByTestId("reasons-list")).toContainText("Not sure about stock");

    // Notes tab + create
    await page.getByTestId("tab-notes").click();
    await expect(page.getByTestId("notes-tab")).toBeVisible();
    await page.getByTestId("note-body").fill("Ops note - no links");
    await page.getByTestId("note-submit").click();
    await expect(page.getByTestId("notes-list")).toContainText("Ops note - no links");

    // No auto-link in notes
    await expect(page.locator('[data-testid="notes-list"] a')).toHaveCount(0);
  });
});
