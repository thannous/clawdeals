import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// Read-only client fixtures: amounts are the currency units returned by the
// owner listing API, identical to public catalogue and mission price amounts.
const listings = [
  { listing_id: "11111111-1111-4111-8111-111111111111", title: "Bike", price_amount: 1234 },
  { listing_id: "22222222-2222-4222-8222-222222222222", title: "Helmet", price_amount: 0 },
].map(listing => ({
  ...listing,
  currency: "EUR",
  category: "cycling",
  status: "LIVE",
  created_at: "2026-10-15T10:00:00.000Z",
}));

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    if (new URL(route.request.url).origin !== origin || !["GET", "HEAD"].includes(route.request.method)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await browser.route("**/api/v1/auth/session", route => route.fulfill({
    status: 200, json: { data: { authenticated: true, owner_id: "33333333-3333-4333-8333-333333333333" } },
  }));
  await browser.route("**/api/v1/owner/agents*", route => route.fulfill({
    status: 200, json: { data: { agents: [] } },
  }));
  await browser.route("**/api/v1/owner/listings?*", route => route.fulfill({
    status: 200, json: { data: { listings, next_cursor: null } },
  }));
  for (const listing of listings) {
    await browser.route(`**/api/v1/owner/listings/${listing.listing_id}`, route => route.fulfill({
      status: 200, json: { data: listing },
    }));
  }
});

test("seller listing prices keep currency units and free prices when opening details", async ({ app, screen, browser }) => {
  await app.open("/my/listings");
  const rows = browser.locator("table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByText("1234.00 EUR")).toBeVisible();
  await expect(rows.nth(1).getByText("0.00 EUR")).toBeVisible();
  await app.screenshot("seller-listing-currency-units");
  await rows.nth(0).tap();
  await expect(browser).toHaveURL(new URL(`/my/listings/${listings[0].listing_id}`, app.baseUrl!).href);
  await expect(screen.getByRole("heading", "Bike")).toBeVisible();
  await expect(screen.getByText("1234.00 EUR")).toBeVisible();
});

test("seller listing detail renders the API price without a hundredfold conversion", async ({ app, screen }) => {
  await app.open(`/my/listings/${listings[0].listing_id}`);
  await expect(screen.getByRole("heading", "Bike")).toBeVisible();
  await expect(screen.getByText("1234.00 EUR")).toBeVisible();
  await app.screenshot("seller-listing-detail-currency-units");

  await app.open(`/my/listings/${listings[1].listing_id}`);
  await expect(screen.getByRole("heading", "Helmet")).toBeVisible();
  await expect(screen.getByText("0.00 EUR")).toBeVisible();
});
