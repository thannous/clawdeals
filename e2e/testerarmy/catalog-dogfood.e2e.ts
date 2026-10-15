import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Synthetic, read-only client seams reproduce catalogue interactions. They do
// not qualify server authorization, persisted offers, purchases or messages.
const listing = {
  listing_id: "11111111-1111-4111-8111-111111111111",
  title: "Dogfood commuter bicycle",
  category: "bicycles",
  condition: "GOOD",
  price: { amount: 150, currency: "EUR" },
  created_at: "2026-10-14T10:00:00.000Z",
  seller: null,
};
const deal = {
  deal_id: "22222222-2222-4222-8222-222222222222",
  title: "Dogfood bicycle helmet",
  status: "ACTIVE",
  price: 35,
  currency: "EUR",
  temperature: 20,
  created_at: "2026-10-14T10:00:00.000Z",
  creator_agent_id: "33333333-3333-4333-8333-333333333333",
};

for (const catalog of [
  { path: "/browse?sort=price_asc", endpoint: "listings", sort: "price_asc", title: listing.title, data: listing },
  { path: "/browse/deals?sort=temp", endpoint: "deals", sort: "temp", title: deal.title, data: deal },
]) {
  test(`reselecting the active ${catalog.endpoint} sort keeps the results`, async ({ app, screen, browser }) => {
    await browser.route(`**/api/v1/public/${catalog.endpoint}?*`, async (route) => {
      await route.fulfill({ status: 200, json: { data: [catalog.data], next_cursor: null } });
    });
    await app.open(catalog.path);
    await expect(screen.getByText(catalog.title)).toBeVisible();
    await screen.getByTestId(`sort-${catalog.sort}`).tap();
    await expect(screen.getByText(catalog.title)).toBeVisible();
    await expect(screen.getByTestId(`sort-${catalog.sort}`)).toHaveAttribute("aria-pressed", "true");
    await app.screenshot(`${catalog.endpoint}-reselected-sort`);
  });
}

for (const kind of ["deals", "offers"] as const) {
  test(`owner ${kind} preserves All, recovers filters and offers a path to browse`, async ({ app, screen, browser }) => {
    await browser.route("**/api/v1/auth/session", async (route) => {
      await route.fulfill({ status: 200, json: { data: {
        authenticated: true, owner_id: "44444444-4444-4444-8444-444444444444",
      } } });
    });
    await browser.route("**/api/v1/owner/agents*", async (route) => {
      await route.fulfill({ status: 200, json: { data: { agents: [] } } });
    });
    const item = kind === "deals" ? deal : {
      offer_id: "55555555-5555-4555-8555-555555555555",
      listing_id: listing.listing_id,
      amount: 125,
      currency: "EUR",
      status: "CREATED",
      created_at: "2026-10-14T10:00:00.000Z",
    };
    let hasItems = true;
    await browser.route(`**/api/v1/owner/${kind}?*`, async (route) => {
      const params = new URL(route.request.url).searchParams;
      await route.fulfill({ status: 200, json: { data: {
        [kind]: !hasItems || params.has("status") || params.has("agent_id") ? [] : [item],
        next_cursor: null,
      } } });
    });
    await app.open(`/my/${kind}`);
    await expect(browser.locator("table tbody tr")).toHaveCount(1);
    await screen.getByTestId(`my-${kind}-toolbar`).getByRole("button", "All").tap();
    await expect(browser.locator("table tbody tr")).toHaveCount(1);
    await screen.getByTestId(`my-${kind}-toolbar`).getByRole("button", "Expired").tap();
    await expect(browser).toHaveURL(/status=EXPIRED/);
    await expect(browser.locator("table tbody tr")).toHaveCount(0);
    await screen.getByTestId(`my-${kind}-clear-filters`).tap();
    await expect(browser).toHaveURL(`/my/${kind}`);
    await expect(browser.locator("table tbody tr")).toHaveCount(1);
    await expect(screen.getByTestId(`my-${kind}-item-link`)).toHaveAttribute(
      "href", kind === "deals" ? `/browse/deals/${deal.deal_id}` : `/browse/${listing.listing_id}`,
    );
    if (await browser.evaluate(() => window.innerWidth < 640)) {
      const price = screen.getByText(kind === "deals" ? "35.00 EUR" : "125 EUR");
      await expect(price).toBeVisible();
      const box = await price.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await app.screenshot(`my-${kind}-recovered`);
    hasItems = false;
    await browser.reload();
    await screen.getByTestId(`my-${kind}-empty-browse`).tap();
    await expect(browser).toHaveURL(kind === "deals" ? "/browse/deals" : "/browse");
    await expect(screen.getByTestId(kind === "deals" ? "browse-deals-toolbar" : "browse-toolbar")).toBeVisible();
  });
}
