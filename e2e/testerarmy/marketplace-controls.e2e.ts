import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// The historical browse and login UI suites use these same client API seams.
// SSR and real authorization/database contracts remain in the retained suites.
const listing = {
  listing_id: "aaaa-1111-2222-3333-444444444444",
  title: "Test Laptop Mock", description: "A great laptop for developers",
  category: "electronics", condition: "NEW",
  price: { amount: 99900, currency: "USD" },
  created_at: "2026-10-05T10:00:00.000Z", seller: null
};

test("a buyer sorts, searches and clears listing filters with exact client requests", async ({ app, screen, browser }) => {
  const requests: URL[] = [];
  await browser.route("**/api/v1/public/listings?*", async route => {
    const url = new URL(route.request.url);
    requests.push(url);
    await route.fulfill({ status: 200, json: {
      data: url.searchParams.get("q") === "missing-e2e" ? [] : [listing], next_cursor: null
    } });
  });
  await app.open("/browse");
  await screen.getByTestId("sort-price_asc").tap();
  await expect.poll(() => requests.some(url => url.searchParams.get("sort") === "price_asc")).toBe(true);
  await expect(screen.getByTestId("browse-grid").getByRole("article")).toHaveCount(1);
  await expect(screen.getByText(listing.title)).toBeVisible();
  if (await browser.evaluate(() => window.innerWidth < 640))
    await screen.getByTestId("browse-filters-toggle").tap();
  await screen.getByTestId("condition-NEW").tap();
  await expect.poll(() => requests.some(url => url.searchParams.get("condition") === "NEW")).toBe(true);
  await expect(browser).toHaveURL(/condition=NEW/);
  await screen.getByTestId("browse-search").fill("missing-e2e");
  await expect.poll(() => requests.some(url => url.searchParams.get("q") === "missing-e2e")).toBe(true);
  await expect(screen.getByTestId("browse-empty")).toBeVisible();
  await expect(screen.getByTestId("browse-grid").getByRole("article")).toHaveCount(0);
  await screen.getByTestId("browse-clear-filters").tap();
  await expect.poll(async () => {
    const url = new URL(await browser.url());
    return { query: url.searchParams.has("q"), condition: url.searchParams.has("condition") };
  }).toEqual({ query: true, condition: false });
  await expect(screen.getByTestId("browse-search")).toHaveValue("missing-e2e");
  await screen.getByTestId("browse-search").fill("");
  await expect(screen.getByText(listing.title)).toBeVisible();
  await expect(screen.getByTestId("browse-grid").getByRole("article")).toHaveCount(1);
  await app.screenshot("listing-filters-recovered");
});

test("a buyer recovers a failed price-alert request without keeping stale cards", async ({ app, screen, browser }) => {
  let fail = true;
  const requestedSorts: string[] = [];
  await browser.route("**/api/v1/public/deals?*", async route => {
    requestedSorts.push(new URL(route.request.url).searchParams.get("sort") ?? "");
    await route.fulfill(fail ? {
      status: 503, json: { error: { code: "ERROR", message: "E2E temporary listing service failure" } }
    } : {
      status: 200, json: { data: [{
        deal_id: "aaaa-deal-1111-2222-333333333333", title: "GPU RTX 5090 Flash Sale",
        source_url: "https://example.com/gpu-sale", price: 89900, currency: "USD",
        expires_at: "2030-10-06T10:00:00.000Z", tags: ["gpu"], status: "ACTIVE",
        temperature: 75, votes_up: 12, votes_down: 2, created_at: "2026-10-05T10:00:00.000Z"
      }], next_cursor: null }
    });
  });
  await app.open("/browse/deals");
  await screen.getByTestId("sort-temp").tap();
  await expect.poll(() => requestedSorts.includes("temp")).toBe(true);
  await expect(screen.getByTestId("browse-deals-error")).toBeVisible();
  await expect(screen.getByTestId("browse-deals-grid")).toHaveCount(0);
  fail = false;
  await screen.getByTestId("sort-trend").tap();
  await expect.poll(() => requestedSorts.includes("trend")).toBe(true);
  await expect(screen.getByText("GPU RTX 5090 Flash Sale")).toBeVisible();
  await expect(screen.getByTestId("browse-deals-error")).toHaveCount(0);
  await expect(screen.getByTestId("browse-deals-grid").getByRole("link", /GPU RTX 5090 Flash Sale/)).toHaveCount(1);
  await app.screenshot("price-alert-error-recovered");
});

test("an owner requests the legacy sign-in link for exactly the entered address", async ({ app, screen, browser }) => {
  const submissions: unknown[] = [];
  await browser.route("**/api/v1/auth/login:start", async route => {
    expect(route.request.method).toBe("POST");
    submissions.push(JSON.parse(route.request.postData ?? "{}"));
    await route.fulfill({ status: 201, json: { data: {
      owner_id: "11111111-1111-4111-8111-111111111111",
      session_id: "22222222-2222-4222-8222-222222222222",
      session_token: "cd_os_test_123", expires_at: "2030-02-12T12:00:00Z"
    } } });
  });
  await app.open("/auth/login-legacy");
  await expect(screen.getByTestId("auth-login-page")).toBeVisible();
  await screen.getByTestId("auth-login-email").fill("owner@example.com");
  await screen.getByTestId("auth-login-submit").tap();
  await expect(screen.getByTestId("auth-login-sent")).toBeVisible();
  await expect(screen.getByTestId("auth-login-token")).toContainText("cd_os_test_123");
  await expect(screen.getByTestId("auth-login-verify-link")).toHaveAttribute("href",
    "/auth/verify?session_id=22222222-2222-4222-8222-222222222222&token=cd_os_test_123");
  expect(submissions).toEqual([{ email: "owner@example.com" }]);
  await app.screenshot("legacy-signin-link-requested");
});
