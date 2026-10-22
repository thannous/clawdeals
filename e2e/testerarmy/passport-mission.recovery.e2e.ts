import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ownerId = "cb111111-1111-4111-8111-111111111111";
const missionId = "cb222222-2222-4222-8222-222222222222";
const requestKey = `clawdeals:buy-mission-request:v2:${ownerId}`;

// Deliberate response-corruption simulation. Connected Auth, persistence and
// matching are qualified separately in passport-missions-live.
test("passport mission client recovery simulation: weakened criteria in a 201 preserve the exact confirmed brief and retry key", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl).origin;
  const writes: { key: string; body: string }[] = [];
  let persisted: any;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerId } } }));
  await browser.route("**/api/v1/owner/agents*", route => route.fulfill({ json: { data: { agents: [] } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await browser.route("**/api/v1/owner/missions", route => {
    if (route.request.method === "GET") return route.fulfill({ json: { items: persisted ? [persisted] : [], next_cursor: null } });
    const write = { key: route.request.headers["idempotency-key"], body: route.request.postData || "" };
    writes.push(write);
    persisted ||= { ...JSON.parse(write.body), watchlist_id: missionId, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
    const response = structuredClone(persisted);
    if (writes.length === 1) response.criteria.mission.smartphone.battery_health_min = 0;
    return route.fulfill({ status: 201, json: response });
  });
  await browser.route(`**/api/v1/owner/missions/${missionId}`, route => route.fulfill({ json: persisted }));
  await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, route => route.fulfill({ json: { items: [], alerts: [], next_cursor: null, status: "ACTIVE" } }));
  await app.open("/fr/my/missions/new?query=iPhone%2013&price_max=400");
  await screen.getByTestId("buy-mission-smartphone-enabled").check();
  await screen.getByTestId("buy-mission-smartphone-model").fill("iPhone 13");
  await screen.getByTestId("buy-mission-smartphone-battery-min").fill("90");
  await screen.getByTestId("buy-mission-smartphone-check-screen").check();
  await screen.getByRole("button", "Vérifier ma mission").click();
  const review = screen.getByRole("region", "Vérifier ma mission");
  await review.getByRole("button", "Confirmer la mission").click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(review.getByRole("alert")).toBeVisible();
  await expect(review.getByRole("button", "Modifier")).toBeDisabled();
  await expect(review.getByTestId("buy-mission-smartphone-summary")).toContainText("90");
  const saved = await browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null"), requestKey);
  expect(saved).toMatchObject({ ownerId, key: writes[0].key, fingerprint: writes[0].body });
  expect(JSON.parse(writes[0].body).criteria.mission.smartphone).toEqual({ version: 1, model: "iPhone 13", battery_health_min: 90, required_checks: ["screen"] });
  await app.screenshot("smartphone-mission-weakened-response-recovery");
  await browser.reload();
  await screen.getByRole("button", "Vérifier ma mission").click();
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
  await expect(screen.getByTestId("buy-mission-smartphone-summary")).toContainText("90");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(await browser.evaluate(key => sessionStorage.getItem(key), requestKey)).toBeNull();
});

for (const smartphoneRequested of [true, false]) {
  test(`passport mission WebMCP recovery simulation: ${smartphoneRequested ? "dropped required checks" : "unrequested smartphone criteria"} never report success or replace an approved retry`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl).origin;
    const writes: { key: string; body: string }[] = [];
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
      ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: false } } }));
    await browser.addInitScript(() => {
      localStorage.setItem("clawdeals_api_key", "cd_test_passport_recovery_only");
      Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool() {} } });
    });
    await browser.route("**/api/v1/watchlists", route => {
      const write = { key: route.request.headers["idempotency-key"], body: route.request.postData || "" };
      writes.push(write);
      const response = { ...JSON.parse(write.body), watchlist_id: missionId };
      if (writes.length === 1) {
        if (smartphoneRequested) response.criteria.mission.smartphone.required_checks = [];
        else response.criteria.mission.smartphone = { version: 1, model: "iPhone 13", battery_health_min: 90, required_checks: ["screen"] };
      }
      return route.fulfill({ status: 201, json: response });
    });
    await app.open("/fr/webmcp");
    await screen.getByRole("textbox", "Objet recherché").fill("iPhone 13");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    if (smartphoneRequested) {
      await screen.getByTestId("buy-mission-smartphone-enabled").check();
      await screen.getByTestId("buy-mission-smartphone-model").fill("iPhone 13");
      await screen.getByTestId("buy-mission-smartphone-battery-min").fill("90");
      await screen.getByTestId("buy-mission-smartphone-check-screen").check();
    }
    await screen.getByRole("button", "Créer la mission").click();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    if (smartphoneRequested) await expect(screen.getByTestId("webmcp-confirm-modal").getByTestId("buy-mission-smartphone-summary")).toContainText("90");
    else await expect(screen.getByTestId("webmcp-confirm-modal").getByTestId("buy-mission-smartphone-summary")).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await screen.getByTestId("webmcp-confirm-modal").getByRole("button", "Approuver").click();
    await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "OUTCOME_UNKNOWN");
    await expect(screen.getByTestId("buy-mission-summary")).toHaveCount(0);
    expect(JSON.parse(writes[0].body).criteria.mission.smartphone).toEqual(smartphoneRequested ? { version: 1, model: "iPhone 13", battery_health_min: 90, required_checks: ["screen"] } : undefined);
    const minimize = screen.getByRole("button", "Réduire");
    if (await minimize.isVisible()) await minimize.click();
    if (smartphoneRequested) await screen.getByTestId("buy-mission-smartphone-battery-min").fill("80");
    else await screen.getByRole("textbox", "Objet recherché").fill("Ordinary changed brief");
    await screen.getByRole("button", "Créer la mission").scrollIntoView();
    await screen.getByRole("button", "Créer la mission").click();
    if (smartphoneRequested) await expect(screen.getByTestId("buy-mission-smartphone-summary")).toContainText("90");
    else await expect(screen.getByTestId("buy-mission-smartphone-summary")).toHaveCount(0);
    await expect(screen.getByTestId("buy-mission-summary")).toBeVisible();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    await app.screenshot(smartphoneRequested ? "smartphone-webmcp-approved-criteria-recovered" : "ordinary-webmcp-approved-criteria-recovered");
  });
}
