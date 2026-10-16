import { expect, type Locator } from "e2e";
import { test } from "./fixtures";

async function expectFullyVisible(locator: Locator, viewport: { width: number; height: number }) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

// The fixture supplies isolated real owners and an owned listing. Sign-in uses
// real server-issued cookies without entering a Secret into the browser, so
// these captures remain available. Network traces and video stay disabled.
test("a connected seller keeps their listing when selecting All twice and can open its private detail", { trace: "off", video: "off" }, async ({ app, browser, screen, commerceFixture: fixture }) => {
  await fixture.signIn("seller", "/fr/my/listings");
  await expect(screen.getByTestId("my-listings-page")).toBeVisible();
  const listingRow = screen.getByRole("button", new RegExp(fixture.listing.title));
  await expect(listingRow).toBeVisible();
  await expect(listingRow).toContainText("125.00 EUR");
  await expect(listingRow).toContainText(/en ligne/i);
  await expect(listingRow).toContainText(`Commerce seller ${fixture.id}`);
  const viewport = await browser.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  await app.screenshot("seller-listing-overview-loaded");
  if (viewport.width < 640) {
    await expectFullyVisible(listingRow.getByText("125.00 EUR", { exact: true }), viewport);
    await expectFullyVisible(listingRow.getByText(/^en ligne$/i), viewport);
  } else {
    // A visible badge can still be fragmented into letters by a long agent
    // name. Count the rendered text lines rather than its CSS classes.
    expect(await browser.evaluate(() => {
      const badge = [...document.querySelectorAll('[data-testid="my-listings-page"] tbody span')]
        .find(element => element.textContent?.trim().toLowerCase() === "en ligne");
      if (!badge) return 0;
      const range = document.createRange();
      range.selectNodeContents(badge);
      return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length;
    })).toBe(1);
  }

  await listingRow.click();
  await expect(browser).toHaveURL(`/fr/my/listings/${fixture.listing.id}`);
  const detail = screen.getByTestId("my-listing-detail-page");
  await expect(detail.getByRole("heading", fixture.listing.title, { exact: true })).toBeVisible();
  await expect(detail).toContainText("125.00 EUR");
  await expect(detail.getByRole("button", fixture.listing.id.slice(0, 8), { exact: true }))
    .toHaveAttribute("title", fixture.listing.id);
  await app.screenshot("seller-owned-listing-detail");
  await expectFullyVisible(detail.getByRole("heading", fixture.listing.title, { exact: true }), viewport);
  await expectFullyVisible(detail.getByText(/^en ligne$/i), viewport);
  await expectFullyVisible(detail.getByText(`${fixture.listing.query} été`, { exact: true }), viewport);
  await expectFullyVisible(detail.getByText("unknown", { exact: true }), viewport);
  await detail.getByRole("button", /Retour/).click();
  await expect(browser).toHaveURL("/fr/my/listings");
  await expect(listingRow).toBeVisible();

  const toolbar = screen.getByTestId("my-listings-toolbar");
  const all = toolbar.getByRole("button", "Tous", { exact: true });
  await app.screenshot("seller-listings-before-active-all");
  await all.click();
  await app.screenshot("seller-listings-after-active-all");
  await expect(listingRow).toBeVisible();
  await all.click();
  await expect(listingRow).toBeVisible();
  await expect(browser.locator("table tbody tr")).toHaveCount(1);

  // A genuinely empty filtered result must recover independently of a reload.
  await toolbar.getByRole("button", "Expiré", { exact: true }).click();
  await expect(browser).toHaveURL(/status=EXPIRED/);
  await expect(screen.getByText("Aucune annonce trouvée", { exact: true })).toBeVisible();
  await all.click();
  await expect(browser).toHaveURL("/fr/my/listings");
  await expect(listingRow).toBeVisible();
  await browser.reload();
  await expect(listingRow).toBeVisible();
});

test("a connected seller keeps their owned conversation when selecting All twice and recovers from an empty filter", { trace: "off", video: "off" }, async ({ app, browser, screen, commerceFixture: fixture }) => {
  const created = await fixture.asAgent("buyer", "POST", `/api/v1/listings/${fixture.listing.id}/threads`, {});
  expect({ status: created.status, code: created.body?.error?.code || null }).toEqual({ status: 201, code: null });
  expect(created.body.thread_id).toMatch(/^[0-9a-f-]{36}$/);

  await fixture.signIn("seller", "/fr/my/threads");
  await expect(screen.getByTestId("my-threads-page")).toBeVisible();
  const rows = browser.locator("table tbody tr");
  const listingReference = screen.getByRole("table")
    .getByRole("button", fixture.listing.id.slice(0, 8), { exact: true });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(/ouvert/i);
  await expect(listingReference).toHaveAttribute("title", fixture.listing.id);
  const viewport = await browser.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  if (viewport.width < 640) {
    const people = browser.locator("table tbody dl");
    await expect(people).toContainText("Acheteur");
    await expect(people).toContainText("Vendeur");
    await expect(people).toContainText(`Commerce seller ${fixture.id}`);
    const date = browser.locator("table tbody time");
    await expect(date).toContainText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await app.screenshot("seller-thread-overview-loaded");
    await expectFullyVisible(screen.getByRole("table"), viewport);
    await expectFullyVisible(rows.getByText(/^ouvert$/i), viewport);
    await expectFullyVisible(date, viewport);
    expect(await browser.evaluate(() => {
      const names = [...document.querySelectorAll("table tbody dl dd")];
      return names.length === 2 && names.every(name => {
        const range = document.createRange();
        range.selectNodeContents(name);
        const rects = [...range.getClientRects()];
        return rects.length > 0 && rects.every(rect =>
          rect.width > 0 && rect.left >= 0 && rect.right <= window.innerWidth &&
          rect.top >= 0 && rect.bottom <= window.innerHeight);
      });
    })).toBe(true);
  }

  const toolbar = screen.getByTestId("my-threads-toolbar");
  const all = toolbar.getByRole("button", "Tous", { exact: true });
  await app.screenshot("seller-threads-before-active-all");
  await all.click();
  await app.screenshot("seller-threads-after-active-all");
  await expect(rows).toHaveCount(1);
  await expect(listingReference).toHaveAttribute("title", fixture.listing.id);
  await all.click();
  await expect(rows).toHaveCount(1);

  await toolbar.getByRole("button", "Fermé", { exact: true }).click();
  await expect(browser).toHaveURL(/status=CLOSED/);
  await expect(screen.getByText("Aucun message trouvé", { exact: true })).toBeVisible();
  await all.click();
  await expect(browser).toHaveURL("/fr/my/threads");
  await expect(rows).toHaveCount(1);
  await expect(listingReference).toHaveAttribute("title", fixture.listing.id);
  await browser.reload();
  await expect(rows).toHaveCount(1);
});

test("a seller opens their private reserved listing from an accepted offer", { trace: "off", video: "off" }, async ({ app, browser, screen, commerceFixture: fixture }) => {
  const exactResponse = (response: { status: number; body: any }, status: number) => {
    expect({ status: response.status, code: response.body?.error?.code || null }).toEqual({ status, code: null });
    return response.body;
  };
  const thread = exactResponse(await fixture.asAgent("buyer", "POST", `/api/v1/listings/${fixture.listing.id}/threads`, {}), 201);
  const offer = exactResponse(await fixture.asAgent("buyer", "POST", `/api/v1/listings/${fixture.listing.id}/offers`, {
    thread_id: thread.thread_id,
    amount: 120,
    currency: "EUR",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }), 201);
  const accepted = exactResponse(await fixture.asAgent("seller", "POST", `/api/v1/offers/${offer.offer_id}/accept`, {}), 200);
  expect(accepted).toMatchObject({ status: "ACCEPTED", listing_status: "RESERVED", transaction: { status: "ACCEPTED" } });

  await fixture.signIn("seller", "/fr/my/offers?status=ACCEPTED");
  await expect(screen.getByTestId("my-offers-page")).toBeVisible();
  const table = screen.getByRole("table");
  await expect(browser.locator("table tbody tr")).toHaveCount(1);
  await expect(table).toContainText("120 EUR");
  await expect(table).toContainText(/acceptée/i);
  await expect(table.getByRole("button", fixture.listing.id.slice(0, 8), { exact: true }))
    .toHaveAttribute("title", fixture.listing.id);
  await app.screenshot("seller-accepted-offer-reserved-context");

  // The existing "Voir l’annonce" action must keep useful owner context after
  // reservation, when the public listing is deliberately no longer available.
  const ownListing = table.getByRole("link", "Voir l’annonce", { exact: true });
  await expect(ownListing).toHaveAttribute("href", new RegExp(`/(?:fr/)?my/listings/${fixture.listing.id}$`));
  await ownListing.click();
  await expect(browser).toHaveURL(`/fr/my/listings/${fixture.listing.id}`);
  const detail = screen.getByTestId("my-listing-detail-page");
  await expect(detail.getByRole("heading", fixture.listing.title, { exact: true })).toBeVisible();
  await expect(detail).toContainText(/réservé/i);
  await expect(detail).toContainText("125.00 EUR");
  await app.screenshot("seller-reserved-private-listing-from-offer");
  const viewport = await browser.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  await expectFullyVisible(detail.getByRole("heading", fixture.listing.title, { exact: true }), viewport);
  await expectFullyVisible(detail.getByText(/^réservé$/i), viewport);
  await expectFullyVisible(detail.getByText(`${fixture.listing.query} été`, { exact: true }), viewport);
  await expectFullyVisible(detail.getByText("unknown", { exact: true }), viewport);
});
