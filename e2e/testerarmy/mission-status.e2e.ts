import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// A suspended agent pauses a mission on the server even while the stored
// watchlist stays active and its expiration is still in the future.
test("a server-paused mission stays paused in its list and detail", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  const missionId = "33333333-3333-4333-8333-333333333333";
  const query = "Vélo pliant conservé";
  const mission = {
    watchlist_id: missionId, name: query, active: true, status: "PAUSED", market_code: "FR", currency: "EUR",
    created_at: new Date().toISOString(),
    criteria: { query, notification_mode: "in_app", geo: { lat: 45.764, lon: 4.8357 }, distance_km: 12, mission: {
      version: 1, kind: "BUY", preferred_price_max: 75.5, hard_budget_max: 83.25, currency: "EUR",
      requirements: [], autonomous_actions: ["search"], contact_reveal: "manual_bilateral_approval",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: { label: "Lyon", lat: 45.764, lon: 4.8357, radius_km: 12 }
    } }
  };
  await browser.route("**/*", async route => {
    if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
    else await route.abort();
  });
  await browser.route("**/api/v1/auth/session", async route => {
    await route.fulfill({ json: { data: { authenticated: true, owner_id: "11111111-1111-4111-8111-111111111111" } } });
  });
  await browser.route("**/api/v1/owner/missions", async route => {
    await route.fulfill({ json: { items: [mission], next_cursor: null } });
  });
  await browser.route(`**/api/v1/owner/missions/${missionId}`, async route => { await route.fulfill({ json: mission }); });
  await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, async route => {
    await route.fulfill({ json: { items: [], next_cursor: null, status: "PAUSED" } });
  });
  await app.open("/fr/my/missions");
  const item = screen.getByTestId("owner-missions").getByRole("article").filter({ hasText: query });
  await expect(item).toContainText("En pause");
  await item.getByRole("link", query).click();
  await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
  await expect(screen.getByTestId("buy-mission-summary")).toContainText("En pause", { ignoreCase: true });
  await expect(screen.getByTestId("mission-no-matches")).toContainText("Cette recherche n’est plus active");
  await browser.reload();
  await expect(screen.getByTestId("buy-mission-summary")).toContainText("En pause", { ignoreCase: true });
  await app.screenshot("server-paused-mission-detail");
});
