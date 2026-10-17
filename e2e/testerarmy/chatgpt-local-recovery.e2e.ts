import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// UI recovery only: intercept every ChatGPT request, including disconnect, so
// this regression never revokes a personal grant or consumes a subscription.
for (const refreshFails of [false, true]) {
  test(`ChatGPT can reconnect after disconnect${refreshFails ? " and a failed status refresh" : ""}`, {
    skip: process.env.TESTERARMY_CHATGPT_UI !== "1" ? "Requires the local ChatGPT panel" : false
  }, async ({ app, browser, screen }) => {
    expect(new URL(app.baseUrl!).hostname).toBe("127.0.0.1");
    const origin = new URL(app.baseUrl!).origin;
    const missionId = "33333333-3333-4333-8333-333333333333";
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const mission = {
      watchlist_id: missionId, name: "Vélo pliant", active: true, status: "ACTIVE", market_code: "FR", currency: "EUR",
      created_at: new Date().toISOString(),
      criteria: { query: "Vélo pliant", mission: {
        version: 1, kind: "BUY", preferred_price_max: 75, hard_budget_max: 85, currency: "EUR",
        requirements: [], autonomous_actions: ["search"], contact_reveal: "manual_bilateral_approval",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        location: { label: "Lyon", lat: 45.764, lon: 4.8357, radius_km: 12 }
      } }
    };
    let connected = true;
    let failStatus = refreshFails;
    let connects = 0;
    let disconnects = 0;
    await browser.route("**/*", async route => {
      if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerId } } }));
    await browser.route(`**/api/v1/owner/missions/${missionId}`, route => route.fulfill({ json: mission }));
    await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, route => route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } }));
    await browser.route("**/api/local/chatgpt", async route => {
      if (route.request.method === "GET") {
        if (!connected && failStatus) { await route.fulfill({ status: 503, json: { error: { code: "CHATGPT_UNAVAILABLE" } } }); return; }
        await route.fulfill({ json: { connected, available: true, account: connected ? "Compte de test" : null,
          models: connected ? [{ id: "synthetic-model", name: "Modèle de test" }] : [] } });
      } else {
        const body = JSON.parse(route.request.postData || "{}");
        expect(route.request.headers["x-expected-owner-id"]).toBe(ownerId);
        if (body.action === "disconnect") {
          disconnects++; connected = false;
          await route.fulfill({ json: { connected: false } });
        } else {
          expect(body.action).toBe("connect"); connects++;
          await route.fulfill({ status: 503, json: { error: { code: "CHATGPT_UNAVAILABLE" } } });
        }
      }
    });
    await app.open(`/fr/my/missions/${missionId}`);
    const section = screen.getByTestId("mission-chatgpt");
    await expect(section.getByTestId("chatgpt-connected")).toBeVisible();
    await section.getByRole("button", "Déconnecter ChatGPT").click();
    await expect(section.getByRole("button", "Continuer avec ChatGPT")).toBeEnabled();
    expect(disconnects).toBe(1);
    if (refreshFails) {
      await expect(section.getByRole("alert")).toBeVisible();
      failStatus = false;
      await section.getByRole("button", "Réessayer la connexion").click();
      await expect(section.getByRole("alert")).not.toBeVisible();
    }
    await section.getByRole("button", "Continuer avec ChatGPT").click();
    await expect.poll(() => connects).toBe(1);
    await expect(section.getByRole("alert")).toBeVisible();
    await expect(section.getByRole("button", "Continuer avec ChatGPT")).toBeEnabled();
  });
}
