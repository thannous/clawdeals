import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Read-only synthetic owner/API seams. Real counter creation and authorization
// are exercised separately by commerce-live; this pins the resulting UI state.
for (const locale of [
  { path: "/my/offers", name: "EN", countered: "Countered", all: "All" },
  { path: "/fr/my/offers", name: "FR", countered: "Contre-proposée", all: "Tous" },
  { path: "/es/my/offers", name: "ES", countered: "Contraofertada", all: "Todos" },
]) {
  test(`${locale.name} countered offers remain readable and filterable after reload`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    await browser.route("**/*", async route => {
      if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ status: 200, json: {
      data: { authenticated: true, owner_id: "33333333-3333-4333-8333-333333333333" },
    } }));
    await browser.route("**/api/v1/owner/agents*", route => route.fulfill({ status: 200, json: { data: { agents: [] } } }));
    const offers = [
      { offer_id: "11111111-1111-4111-8111-111111111111", status: "COUNTERED", amount: 120 },
      { offer_id: "22222222-2222-4222-8222-222222222222", status: "CREATED", amount: 129 },
    ].map(offer => ({
      ...offer, currency: "EUR", listing_status: "LIVE", listing_id: "44444444-4444-4444-8444-444444444444",
      created_at: "2026-10-15T10:00:00.000Z",
    }));
    await browser.route("**/api/v1/owner/offers?*", async route => {
      const status = new URL(route.request.url).searchParams.get("status");
      await route.fulfill({ status: 200, json: { data: {
        offers: status ? offers.filter(offer => offer.status === status) : offers, next_cursor: null,
      } } });
    });
    await app.open(locale.path);
    await expect(browser.locator("table tbody tr")).toHaveCount(2);
    await expect(browser.locator("table tbody").getByText(locale.countered, { exact: true })).toBeVisible({ timeout: 3000 });
    const filter = screen.getByTestId("my-offers-toolbar").getByRole("button", locale.countered, { exact: true });
    await filter.click();
    await expect(browser).toHaveURL(/status=COUNTERED/);
    await expect(browser.locator("table tbody tr")).toHaveCount(1);
    await expect(browser.locator("table tbody")).toContainText("120 EUR");
    await expect(browser.locator("table tbody")).not.toContainText("129 EUR");
    await browser.reload();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(browser.locator("table tbody tr")).toHaveCount(1);
    const viewportWidth = await browser.evaluate(() => window.innerWidth);
    if (viewportWidth < 640) {
      const badge = await browser.locator("table tbody").getByText(locale.countered, { exact: true }).boundingBox();
      expect(badge).not.toBeNull();
      expect(badge!.x + badge!.width).toBeLessThanOrEqual(viewportWidth);
    }
    await app.screenshot(`offers-countered-${locale.name.toLowerCase()}`);
    await screen.getByTestId("my-offers-toolbar").getByRole("button", locale.all, { exact: true }).click();
    await expect(browser.locator("table tbody tr")).toHaveCount(2);
    await expect(filter).toHaveAttribute("aria-pressed", "false");
  });
}
