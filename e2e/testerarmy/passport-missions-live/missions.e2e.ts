import { credentials, expect } from "e2e";
import type { Browser } from "@e2e-dev/web";
import { test, type PassportMissionFixture } from "./fixtures";

const smartphone = { version: 1, model: "iPhone 13", battery_health_min: 90, required_checks: ["screen", "locks"] };
function body(fixture: PassportMissionFixture, criteria: unknown = smartphone) {
  return { name: fixture.query, active: true, market_code: "FR", criteria: {
    query: fixture.query, geo: { lat: 48.8566, lon: 2.3522 }, distance_km: 12,
    mission: { version: 1, kind: "BUY", preferred_price_max: 300, hard_budget_max: 400, currency: "EUR",
      requirements: [], autonomous_actions: ["search"], contact_reveal: "manual_bilateral_approval",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 12 },
      ...(criteria === undefined ? {} : { smartphone: criteria }),
    },
  } };
}
async function createMission(fixture: PassportMissionFixture) {
  const response = await fixture.api("buyer", "POST", "/api/v1/owner/missions", body(fixture));
  expect(response.status).toBe(201);
  const id = response.body.watchlist_id;
  expect((await fixture.missionRow(id)).criteria.mission.smartphone).toEqual(smartphone);
  return id as string;
}
async function login(context: { app: any; screen: any; browser: Browser; passportMission: PassportMissionFixture }, next: string) {
  await context.app.open(`/fr/auth/login?next=${encodeURIComponent(next)}`);
  await context.screen.getByLabel("Email").fill(context.passportMission.email);
  await context.screen.getByLabel("Mot de passe").fill(credentials.user("mission").password);
  await context.screen.getByTestId("auth-login-submit").click();
  await expect(context.browser).toHaveURL(next);
}
async function matches(fixture: PassportMissionFixture, id: string) {
  const result = await fixture.api("buyer", "GET", `/api/v1/owner/missions/${id}/matches`);
  expect(result.status).toBe(200);
  return result.body;
}
async function drain(fixture: PassportMissionFixture, queue: "watchlist-backfill-queue" | "watchlist-match-queue") {
  const result = await fixture.drain(queue);
  expect(result.status).toBe(200);
}

// A real credential is entered in each journey. Deliberately retain no network
// trace, video or post-login screenshots; safe fixture receipts prove cleanup.
test("passport mission connected: comparison criteria survive login, reload and creation; unknown phones remain unconfirmed", { trace: "off", video: "off" }, async ({ app, browser, screen, passportMission: fixture }) => {
  await app.open(`/fr/browse/compare?ids=${fixture.entries.compatible.id},${fixture.entries.peer.id}`);
  await screen.getByTestId(`comparison-create-mission-${fixture.entries.compatible.id}`).click();
  await expect(browser).toHaveURL(/\/fr\/my\/missions\/new\?draft=/);
  const draftUrl = new URL(await browser.url());
  expect(draftUrl.pathname).toBe("/fr/my/missions/new");
  expect([...draftUrl.searchParams.keys()]).toEqual(["draft"]);
  expect(draftUrl.searchParams.get("draft")).toMatch(/^[0-9a-f-]{36}$/);
  await expect(screen.getByTestId("buy-mission-smartphone-enabled")).toBeChecked();
  await expect(screen.getByTestId("buy-mission-smartphone-model")).toHaveValue("iPhone 13");
  await expect(screen.getByTestId("buy-mission-smartphone-battery-min")).toHaveValue("");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("300");
  await screen.getByRole("textbox", "Objet recherché").fill(fixture.query);
  await screen.getByRole("spinbutton", "Plafond absolu").fill("400");
  await screen.getByTestId("buy-mission-city").selectOption({ value: "paris" });
  await screen.getByRole("spinbutton", "Rayon en km").fill("12");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await screen.getByTestId("buy-mission-smartphone-battery-min").fill("90");
  for (const check of ["screen", "locks"]) await screen.getByTestId(`buy-mission-smartphone-check-${check}`).check();
  await app.screenshot("smartphone-mission-before-login");
  await screen.getByRole("button", "Continuer").click();
  await expect(screen.getByTestId("auth-login-page")).toBeVisible();
  const returnUrl = new URL(await browser.url()).searchParams.get("next")!;
  expect(new URL(returnUrl, app.baseUrl).searchParams.get("draft")).toBe(draftUrl.searchParams.get("draft"));
  await screen.getByLabel("Email").fill(fixture.email);
  await screen.getByLabel("Mot de passe").fill(credentials.user("mission").password);
  await screen.getByTestId("auth-login-submit").click();
  await expect(browser).toHaveURL(returnUrl);
  await browser.reload();
  await expect(screen.getByTestId("buy-mission-smartphone-model")).toHaveValue("iPhone 13");
  await expect(screen.getByTestId("buy-mission-smartphone-battery-min")).toHaveValue("90");
  await expect(screen.getByTestId("buy-mission-smartphone-check-screen")).toBeChecked();
  await expect(screen.getByTestId("buy-mission-smartphone-check-locks")).toBeChecked();
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(fixture.query);
  await screen.getByRole("button", "Vérifier ma mission").click();
  const review = screen.getByRole("region", "Vérifier ma mission");
  await expect(review.getByTestId("buy-mission-smartphone-summary")).toContainText("iPhone 13");
  await expect(review.getByTestId("buy-mission-smartphone-summary")).toContainText("90");
  expect(fixture.missionWrites).toHaveLength(0);
  await review.getByRole("button", "Confirmer la mission").click();
  await expect(screen.getByTestId("owner-mission-detail")).toBeVisible();
  const id = new URL(await browser.url()).pathname.split("/").pop()!;
  const persisted = await fixture.missionRow(id);
  expect(persisted.criteria.mission.smartphone).toEqual(smartphone);
  expect(persisted.criteria.notification_mode).toBe("in_app");
  expect(fixture.missionWrites).toHaveLength(1);
  const result = await matches(fixture, id);
  const compatible = result.items.filter((item: any) => item.smartphone_compatibility.status === "compatible");
  const unknown = result.items.filter((item: any) => item.smartphone_compatibility.status === "unknown");
  expect(compatible.map((item: any) => item.listing_id).sort()).toEqual([fixture.entries.compatible.id, fixture.entries.peer.id].sort());
  expect(unknown.map((item: any) => item.listing_id).sort()).toEqual([fixture.entries.unknown.id, fixture.entries.without.id].sort());
  expect(compatible[0].smartphone_compatibility.reasons.map((reason: any) => reason.code)).toEqual(expect.arrayContaining(["model_matches", "battery_meets_minimum", "check_ok"]));
  await expect(screen.getByTestId("mission-matches-compatible").getByTestId(`mission-match-${fixture.entries.compatible.id}`)).toBeVisible();
  await expect(screen.getByTestId("mission-matches-unknown").getByTestId(`mission-match-${fixture.entries.unknown.id}`)).toBeVisible();
  await drain(fixture, "watchlist-backfill-queue");
  const after = await matches(fixture, id);
  expect(after.alerts.map((alert: any) => alert.listing_id).sort()).toEqual([fixture.entries.compatible.id, fixture.entries.peer.id].sort());
  expect(await fixture.externalDeliveries()).toBe(0);
  await browser.reload();
  await expect(screen.getByTestId("buy-mission-smartphone-summary")).toContainText("90");
  await expect(screen.getByTestId(`mission-alert-${fixture.entries.compatible.id}`)).toBeVisible();
  await screen.getByRole("button", "Repartir de ces critères").click();
  await expect(screen.getByTestId("buy-mission-smartphone-battery-min")).toHaveValue("90");
  await expect(screen.getByTestId("buy-mission-smartphone-check-screen")).toBeChecked();
});

test("passport mission connected: passport and price saves produce only eligible in-app alerts and stable deduplication", { trace: "off", video: "off" }, async context => {
  const { browser, screen, passportMission: fixture } = context;
  const id = await createMission(fixture);
  await drain(fixture, "watchlist-backfill-queue");
  await drain(fixture, "watchlist-match-queue");
  await login(context, `/fr/my/missions/${id}`);
  const initial = await fixture.alertRows(id);
  expect(initial.map(row => row.entity_id).sort()).toEqual([fixture.entries.compatible.id, fixture.entries.peer.id].sort());
  expect((await fixture.savePassport("lowBattery", 95, "Mesure mise à jour à 95 %")).status).toBe(200);
  await drain(fixture, "watchlist-match-queue");
  expect((await matches(fixture, id)).alerts.map((alert: any) => alert.listing_id)).toContain(fixture.entries.lowBattery.id);
  expect((await fixture.changePrice("expensive", 350)).status).toBe(200);
  await drain(fixture, "watchlist-match-queue");
  const first = await fixture.alertRows(id);
  expect(first).toHaveLength(4);
  expect(first.some(row => row.entity_id === fixture.entries.unknown.id || row.entity_id === fixture.entries.without.id)).toBe(false);
  await drain(fixture, "watchlist-match-queue");
  await drain(fixture, "watchlist-backfill-queue");
  expect(await fixture.alertRows(id)).toEqual(first);
  expect((await fixture.changePrice("expensive", 340)).status).toBe(200);
  await drain(fixture, "watchlist-match-queue");
  const updated = await fixture.alertRows(id);
  expect(updated).toHaveLength(4);
  const before = first.find(row => row.entity_id === fixture.entries.expensive.id);
  const after = updated.find(row => row.entity_id === fixture.entries.expensive.id);
  expect(after.watchlist_match_id).toBe(before.watchlist_match_id);
  expect(after).toEqual(before);
  expect((await fixture.changePrice("expensive", 450)).status).toBe(200);
  await drain(fixture, "watchlist-match-queue");
  expect((await fixture.alertRows(id)).some(row => row.entity_id === fixture.entries.expensive.id)).toBe(false);
  expect((await fixture.changePrice("expensive", 340)).status).toBe(200);
  await drain(fixture, "watchlist-match-queue");
  const renewed = (await fixture.alertRows(id)).find(row => row.entity_id === fixture.entries.expensive.id);
  expect(renewed.reason).toMatchObject({ change: "price_changed", previous_price: 450, current_price: 340 });
  expect(await fixture.externalDeliveries()).toBe(0);
  await browser.reload();
  await expect(screen.getByTestId(`mission-alert-${fixture.entries.lowBattery.id}`)).toBeVisible();
  await expect(screen.getByTestId(`mission-alert-${fixture.entries.expensive.id}`)).toBeVisible();
  await screen.getByTestId(`mission-alert-compare-${fixture.entries.expensive.id}`).click();
  await expect(browser).toHaveURL(new RegExp(`/fr/browse/compare\\?ids=.*${fixture.entries.expensive.id}`));
  await expect(screen.getByTestId("comparison-page")).toBeVisible();
  expect(new URL(await browser.url()).searchParams.has("battery_health_min")).toBe(false);
});

test("passport mission connected: hidden listings, paused or expired missions and another owner disclose no alerts", { trace: "off", video: "off" }, async context => {
  const { browser, screen, passportMission: fixture } = context;
  const id = await createMission(fixture);
  await drain(fixture, "watchlist-backfill-queue");
  await login(context, `/fr/my/missions/${id}`);
  await fixture.hideListing("compatible");
  const hidden = await matches(fixture, id);
  expect(hidden.items.map((item: any) => item.listing_id)).not.toContain(fixture.entries.compatible.id);
  expect(hidden.alerts.map((item: any) => item.listing_id)).not.toContain(fixture.entries.compatible.id);
  for (const state of ["PAUSED", "EXPIRED"] as const) {
    await fixture.setMissionState(id, state);
    expect((await fixture.savePassport("lowBattery", 97)).status).toBe(200);
    await drain(fixture, "watchlist-match-queue");
    const inactive = await matches(fixture, id);
    expect(inactive).toMatchObject({ status: state, items: [], alerts: [] });
    expect((await fixture.alertRows(id)).some(row => row.entity_id === fixture.entries.lowBattery.id)).toBe(false);
    await browser.reload();
    await expect(screen.getByTestId(/^mission-alert-/)).toHaveCount(0);
    await expect(screen.getByTestId("mission-no-matches")).toBeVisible();
  }
  for (const suffix of ["", "/matches"]) {
    expect((await fixture.api("other", "GET", `/api/v1/owner/missions/${id}${suffix}`)).status).toBe(404);
    expect((await fixture.api("anonymous", "GET", `/api/v1/owner/missions/${id}${suffix}`)).status).toBe(401);
  }
  expect(await fixture.externalDeliveries()).toBe(0);
});

test("passport mission connected: invalid criteria create nothing and opting out preserves a conventional mission", { trace: "off", video: "off" }, async context => {
  const { browser, screen, passportMission: fixture } = context;
  for (const invalid of [
    { ...smartphone, battery_health_min: 101 },
    { ...smartphone, battery_health_min: 90.5 },
    { ...smartphone, required_checks: ["screen", "screen"] },
    { ...smartphone, required_checks: ["invented_check"] },
  ]) expect((await fixture.api("buyer", "POST", "/api/v1/owner/missions", body(fixture, invalid))).status).toBe(400);
  expect((await fixture.api("buyer", "GET", "/api/v1/owner/missions")).body.items).toHaveLength(0);
  await login(context, `/fr/my/missions/new?query=${fixture.query}&price_max=400`);
  await screen.getByTestId("buy-mission-smartphone-enabled").check();
  await screen.getByTestId("buy-mission-smartphone-model").fill("iPhone 13");
  await screen.getByTestId("buy-mission-smartphone-battery-min").fill("90");
  await screen.getByTestId("buy-mission-smartphone-check-screen").check();
  await screen.getByTestId("buy-mission-smartphone-enabled").uncheck();
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await screen.getByRole("button", "Vérifier ma mission").click();
  const review = screen.getByRole("region", "Vérifier ma mission");
  await expect(review.getByTestId("buy-mission-smartphone-summary")).toHaveCount(0);
  await review.getByRole("button", "Confirmer la mission").click();
  await expect(screen.getByTestId("owner-mission-detail")).toBeVisible();
  const id = new URL(await browser.url()).pathname.split("/").pop()!;
  expect((await fixture.missionRow(id)).criteria.mission.smartphone).toBeUndefined();
  const result = await matches(fixture, id);
  expect(result.items.map((item: any) => item.listing_id)).toEqual(expect.arrayContaining([fixture.entries.lowBattery.id, fixture.entries.defective.id, fixture.entries.otherModel.id]));
});


test("passport mission connected: category filters agree across owner results, UI, backfill and match queues", { trace: "off", video: "off" }, async context => {
  const { screen, passportMission: fixture } = context;
  await fixture.setListingCategory("peer", "electronics");
  const payload = body(fixture);
  const response = await fixture.api("buyer", "POST", "/api/v1/owner/missions", {
    ...payload, criteria: { ...payload.criteria, tags: ["smartphones"] },
  });
  expect(response.status).toBe(201);
  const id = response.body.watchlist_id;
  expect((await fixture.missionRow(id)).criteria.tags).toEqual(["smartphones"]);
  await drain(fixture, "watchlist-backfill-queue");
  const backfillAlerts = (await fixture.alertRows(id)).map(row => row.entity_id).sort();
  // A fresh compatible passport must not override a different category in either worker.
  expect((await fixture.savePassport("peer", 98)).status).toBe(200);
  await drain(fixture, "watchlist-match-queue");
  const workerAlerts = (await fixture.alertRows(id)).map(row => row.entity_id).sort();
  const result = await matches(fixture, id);
  await login(context, `/fr/my/missions/${id}`);
  await expect(screen.getByTestId("mission-matches-compatible").getByTestId(`mission-match-${fixture.entries.compatible.id}`)).toBeVisible();
  await expect(screen.getByTestId(`mission-alert-${fixture.entries.compatible.id}`)).toBeVisible();
  // Collect all four real surfaces before asserting, so a mismatch identifies
  // the owner API/UI independently of the persisted worker result.
  expect({
    backfillAlerts,
    workerAlerts,
    ownerCompatible: result.items.filter((item: any) => item.smartphone_compatibility.status === "compatible").map((item: any) => item.listing_id).sort(),
    ownerIncludesWrongCategory: result.items.some((item: any) => item.listing_id === fixture.entries.peer.id),
    ownerAlerts: result.alerts.map((alert: any) => alert.listing_id).sort(),
    visibleWrongCategoryCards: await screen.getByTestId(`mission-match-${fixture.entries.peer.id}`).count(),
    visibleWrongCategoryAlerts: await screen.getByTestId(`mission-alert-${fixture.entries.peer.id}`).count(),
  }).toEqual({
    backfillAlerts: [fixture.entries.compatible.id],
    workerAlerts: [fixture.entries.compatible.id],
    ownerCompatible: [fixture.entries.compatible.id],
    ownerIncludesWrongCategory: false,
    ownerAlerts: [fixture.entries.compatible.id],
    visibleWrongCategoryCards: 0,
    visibleWrongCategoryAlerts: 0,
  });
  expect(await fixture.externalDeliveries()).toBe(0);
});
