import { readFileSync } from "node:fs";
import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// Identified client seams: owner offers, Next page data and the clipboard.
// These tests exercise navigation/copying, not a real offer acceptance or RLS.
const messages = JSON.parse(readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"));
const listingId = "11111111-1111-4111-8111-111111111111";
const offer = {
  offer_id: "22222222-2222-4222-8222-222222222222",
  listing_id: listingId,
  amount: 125,
  currency: "EUR",
  status: "CREATED",
  listing_status: "LIVE",
  created_at: "2026-10-14T10:00:00.000Z",
};

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    const url = new URL(route.request.url);
    if (url.origin !== origin || !["GET", "HEAD"].includes(route.request.method)) {
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
  await browser.addInitScript(`Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => { window.__dogfoodCopiedId = value; } }
  });`);
});

test("a created offer opens its live listing detail", async ({ app, screen, browser }) => {
  const listing = {
    listing_id: listingId,
    title: "Dogfood live commuter bicycle",
    category: "bicycles",
    condition: "GOOD",
    price: { amount: 150, currency: "EUR" },
    images: [],
    created_at: "2026-10-14T10:00:00.000Z",
    seller: null,
  };
  await browser.route("**/api/v1/owner/offers?*", route => route.fulfill({
    status: 200, json: { data: { offers: [offer], next_cursor: null } },
  }));
  await browser.route(new RegExp(`/\\_next/data/[^/]+/(?:en/)?browse/${listingId}\\.json`), route => route.fulfill({
    status: 200, json: { pageProps: { listing, locale: "en", messages }, __N_SSP: true },
  }));
  await browser.route("**/api/v1/public/listings?*", route => route.fulfill({
    status: 200, json: { data: [], next_cursor: null },
  }));
  await app.open("/my/offers");
  await screen.getByTestId("my-offers-item-link").tap();
  await expect(browser).toHaveURL(new URL(`/browse/${listingId}`, app.baseUrl!).href);
  await expect(screen.getByRole("heading", listing.title)).toBeVisible();
  await app.screenshot("created-offer-live-listing");
});

for (const state of [
  { status: "ACCEPTED", listing_status: "RESERVED" },
  { status: "CREATED", listing_status: "REMOVED" },
  { status: "CREATED", listing_status: null },
]) {
  test(`an ${state.status} offer on a ${state.listing_status ?? "missing"} listing keeps a copyable reference without a dead link`, async ({ app, screen, browser }) => {
    await browser.route("**/api/v1/owner/offers?*", route => route.fulfill({
      status: 200, json: { data: { offers: [{ ...offer, ...state }], next_cursor: null } },
    }));
    await app.open("/my/offers");
    await expect(browser.locator("table tbody tr")).toHaveCount(1);
    await expect(screen.getByTestId("my-offers-item-link")).toHaveCount(0);
    await expect(screen.getByText("Listing unavailable publicly")).toBeVisible();
    if (await browser.evaluate(() => window.innerWidth < 640)) {
      const amount = await screen.getByText("125 EUR").boundingBox();
      expect(amount).not.toBeNull();
      expect(amount!.x + amount!.width).toBeLessThanOrEqual(390);
    }
    await screen.getByRole("button", listingId.slice(0, 8)).tap();
    await expect(screen.getByRole("button", "Copied!")).toBeVisible();
    expect(await browser.evaluate("window.__dogfoodCopiedId")).toBe(listingId);
    await expect(browser).toHaveURL(new URL("/my/offers", app.baseUrl!).href);
    await app.screenshot(`offer-${state.status}-${state.listing_status ?? "missing"}-reference`);
  });
}
