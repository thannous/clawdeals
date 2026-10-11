import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Client recovery only: a modeled server commits once, loses the first response,
// then returns the same record for an identical idempotency key and payload.
// The separate mission-live selection proves real Auth/database persistence.
test("an uncertain mission response survives reload and retries the same request", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
    else await route.abort();
  });
  await browser.route("**/api/v1/auth/session", async route => {
    await route.fulfill({ json: { data: { authenticated: true, owner_id: "11111111-1111-4111-8111-111111111111" } } });
  });
  await browser.route("**/api/v1/policies", async route => { await route.fulfill({ json: { data: {} } }); });
  const writes: { key: string; body: string }[] = [];
  const missionId = "22222222-2222-4222-8222-222222222222";
  let mission: any;
  await browser.route("**/api/v1/owner/missions", async route => {
    if (route.request.method === "GET") {
      await route.fulfill({ json: { items: mission ? [mission] : [], next_cursor: null } });
      return;
    }
    const write = { key: route.request.headers["idempotency-key"], body: route.request.postData || "" };
    writes.push(write);
    if (!mission) {
      const input = JSON.parse(write.body);
      mission = { ...input, watchlist_id: missionId, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
      await route.abort();
    } else {
      expect(write).toEqual(writes[0]);
      await route.fulfill({ status: 201, json: mission });
    }
  });
  await browser.route(`**/api/v1/owner/missions/${missionId}`, async route => { await route.fulfill({ json: mission }); });
  await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, async route => {
    await route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } });
  });
  await app.open("/fr/my/missions/new?query=Vélo%20pliant");
  await screen.getByRole("spinbutton", "Prix préféré").fill("75.50");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("83.25");
  await screen.getByRole("button", "Vérifier ma mission").click();
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  await expect(screen.getByRole("region", "Vérifier ma mission").getByRole("alert")).toBeVisible();
  await expect(screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Modifier")).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(writes[0].key).toBeTruthy();
  await browser.reload();
  await screen.getByRole("button", "Vérifier ma mission").click();
  await expect(screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Modifier")).toBeDisabled();
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
  await expect(screen.getByTestId("buy-mission-summary")).toContainText("Vélo pliant", { ignoreCase: true });
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  await app.screenshot("mission-recovered-without-duplicate");
});

for (const firstResponseLost of [false, true]) {
  test(`a quota rejection allows editing and a fresh confirmed request${firstResponseLost ? " after a lost response" : ""}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    const missionId = "44444444-4444-4444-8444-444444444444";
    const writes: { key: string; body: string }[] = [];
    let mission: any;
    await browser.route("**/*", async route => {
      if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    await browser.route("**/api/v1/auth/session", async route => {
      await route.fulfill({ json: { data: { authenticated: true, owner_id: "11111111-1111-4111-8111-111111111111" } } });
    });
    await browser.route("**/api/v1/policies", async route => { await route.fulfill({ json: { data: {} } }); });
    await browser.route("**/api/v1/owner/missions", async route => {
      if (route.request.method !== "POST") { await route.abort(); return; }
      const write = { key: route.request.headers["idempotency-key"], body: route.request.postData || "" };
      writes.push(write);
      if (writes.length === 1 && firstResponseLost) {
        // The modeled server cached its quota rejection, but the browser never
        // received that response. The next retry must first reuse this key/body.
        await route.abort();
        return;
      }
      if (writes.length === 1 || (firstResponseLost && writes.length === 2)) {
        if (firstResponseLost) expect(write).toEqual(writes[0]);
        await route.fulfill({ status: 409, json: { error: { code: "WATCHLIST_LIMIT_REACHED", message: "The mission quota is reached." } } });
        return;
      }
      expect(write.key).not.toBe(writes[0].key);
      const input = JSON.parse(write.body);
      expect(input.criteria.mission.hard_budget_max).toBe(84.5);
      mission = { ...input, watchlist_id: missionId, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
      await route.fulfill({ status: 201, json: mission });
    });
    await browser.route(`**/api/v1/owner/missions/${missionId}`, async route => { await route.fulfill({ json: mission }); });
    await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, async route => {
      await route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } });
    });
    await app.open("/fr/my/missions/new?query=Vélo%20pliant");
    await screen.getByRole("spinbutton", "Prix préféré").fill("75.50");
    await screen.getByRole("spinbutton", "Plafond absolu").fill("83.25");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
    const edit = screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Modifier");
    await expect(screen.getByRole("region", "Vérifier ma mission").getByRole("alert")).toBeVisible();
    if (firstResponseLost) {
      await expect(edit).toBeDisabled();
      expect(writes).toHaveLength(1);
      await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
    }
    await expect(edit).toBeEnabled();
    expect(writes).toHaveLength(firstResponseLost ? 2 : 1);
    await edit.click();
    await screen.getByRole("spinbutton", "Plafond absolu").fill("84.50");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
    await expect(screen.getByTestId("buy-mission-summary")).toContainText("84,50");
    expect(writes).toHaveLength(firstResponseLost ? 3 : 2);
    expect(writes.at(-1)!.key).not.toBe(writes[0].key);
  });
}
