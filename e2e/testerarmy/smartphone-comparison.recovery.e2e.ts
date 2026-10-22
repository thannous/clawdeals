import { test, type Browser } from "@e2e-dev/web";
import { expect } from "e2e";
import type { ComparisonItem } from "../../src/lib/smartphone-comparison";

const firstId = "bc111111-1111-4111-8111-111111111111";
const secondId = "bc222222-2222-4222-8222-222222222222";
const checkIds = ["battery", "screen", "functionality", "locks", "repairs_accessories"] as const;
const stamp = "2026-10-22T12:00:00.000Z";
function available(listing_id: string, title: string, amount: number, health: number): ComparisonItem {
  return {
    listing_id, availability: "available", passport_error: false,
    listing: { listing_id, title, condition: "GOOD", price: { amount, currency: "EUR" }, market_code: "FR" },
    passport: {
      listing_id, revision: 1, model: title, battery_health_percent: health, updated_at: stamp,
      checks: checkIds.map(id => ({ id, answer: "ok", notes: "", status: "declared", photos: [] })),
      questions: checkIds.map(check_id => ({ check_id, reason: "photo_missing", prompt: "Please show a photograph." })),
    },
  };
}
const first = available(firstId, "iPhone recovery first", 200, 80);
const second = available(secondId, "iPhone recovery second", 300, 95);
async function recoveryFixture(browser: Browser, baseUrl: string, passportFailure = false) {
  const origin = new URL(baseUrl).origin;
  const reads: string[][] = [];
  let singleRead = 0;
  // Deliberate API recovery simulation only. Nominal data/persistence is covered
  // separately by comparison-live using the actual local Supabase service.
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/public/smartphone-comparison?*", route => {
    const ids = (new URL(route.request.url).searchParams.get("ids") || "").split(",");
    reads.push(ids);
    if (ids.length === 2) return route.fulfill({ json: { data: { items: [first, passportFailure
      ? { ...second, passport: null, passport_error: true }
      : { listing_id: secondId, availability: "error", listing: null, passport: null, passport_error: false }] } } });
    singleRead += 1;
    // Unavailable items must discard a malformed response carrying private data.
    if (passportFailure && singleRead === 1) return route.fulfill({ json: { data: { items: [{ ...second, availability: "unavailable", passport: null }] } } });
    return route.fulfill({ json: { data: { items: [second] } } });
  });
  return { reads, path: `/fr/browse/compare?ids=${firstId},${secondId}` };
}

test("comparison client recovery simulation: retry one failed item without losing the other smartphone", async ({ app, browser, screen }) => {
  const fixture = await recoveryFixture(browser, app.baseUrl);
  await app.open(fixture.path);
  await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "unavailable");
  await expect(screen.getByTestId(`comparison-item-${firstId}`)).toContainText(first.listing!.title);
  await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(0);
  await screen.getByTestId(`comparison-retry-${secondId}`).tap();
  await expect(screen.getByTestId(`comparison-item-${secondId}`)).toContainText(second.listing!.title);
  await expect(screen.getByTestId(`comparison-winner-${firstId}`)).toBeVisible();
  await screen.getByTestId("comparison-priority-battery").tap();
  await expect(screen.getByTestId(`comparison-winner-${secondId}`)).toBeVisible();
  expect(fixture.reads).toEqual([[firstId, secondId], [secondId]]);
});

test("comparison client recovery simulation: passport failure and inconsistent private payload never fabricate a battery winner", async ({ app, browser, screen }) => {
  const fixture = await recoveryFixture(browser, app.baseUrl, true);
  await app.open(fixture.path);
  await expect(screen.getByTestId(`comparison-winner-${firstId}`)).toBeVisible();
  await screen.getByTestId("comparison-priority-battery").tap();
  await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "incomplete");
  await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(0);
  await screen.getByTestId(`comparison-retry-${secondId}`).tap();
  await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "unavailable");
  await expect(screen.getByTestId(`comparison-item-${secondId}`)).not.toContainText(second.listing!.title);
  await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(0);
  await screen.getByTestId(`comparison-retry-${secondId}`).tap();
  await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "ranked");
  await expect(screen.getByTestId(`comparison-winner-${secondId}`)).toBeVisible();
  await expect(screen.getByTestId("comparison-priority-battery")).toHaveAttribute("aria-pressed", "true");
  expect(fixture.reads).toEqual([[firstId, secondId], [secondId], [secondId]]);
});
