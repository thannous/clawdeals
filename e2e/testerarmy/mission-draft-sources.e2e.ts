import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { missionPayload } from "../../src/ui/my-missions/missionClient";
import type { BuyMissionInput } from "../../src/ui/webmcp/BuyMissionPanel";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const missionId = "33333333-3333-4333-8333-333333333333";
const sourceOne = 'search:["Vélo","80"]';
const sourceTwo = 'search:["Casque","50"]';
const pathOne = "/fr/my/missions/new?query=Vélo&price_max=80";
const pathTwo = "/fr/my/missions/new?query=Casque&price_max=50";
const draft = (query: string, requirements: string, budget = "80") => ({
  query, marketCode: "FR", cityPreset: "paris", locationLabel: "Paris", latitude: "48.85", longitude: "2.35", radiusKm: "25",
  preferredPriceMax: budget, hardBudgetMax: budget, requirements, autonomousActions: ["search"],
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16)
});
const input: BuyMissionInput = {
  query: "Vélo", market_code: "FR", location_label: "Paris", latitude: 48.85, longitude: 2.35, radius_km: 25,
  preferred_price_max: 80, hard_budget_max: 80, requirements: ["Tentative envoyée"], autonomous_actions: ["search"],
  contact_reveal: "manual_bilateral_approval", expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
};
const pending = { input, ownerId: ownerA, key: "44444444-4444-4444-8444-444444444444", fingerprint: JSON.stringify(missionPayload(input)) };

for (const unrelatedRequest of [false, true]) {
  test(`an unowned v1 draft stays quarantined${unrelatedRequest ? " even beside an unrelated owner's request" : " without a request"}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    const legacy = JSON.stringify({ source: sourceOne, at: Date.now(), draft: draft("Vélo", unrelatedRequest ? "Ancien brief privé B" : "Ancien brief privé A") });
    await browser.addInitScript(({ legacy, pending, unrelatedRequest }) => {
      if (!sessionStorage.getItem("fixture.seeded")) {
        sessionStorage.setItem("clawdeals:buy-mission-draft:v1", legacy);
        if (unrelatedRequest) sessionStorage.setItem("clawdeals:buy-mission-request:v1", JSON.stringify(pending));
        sessionStorage.setItem("fixture.seeded", "yes");
      }
    }, { legacy, pending, unrelatedRequest });
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: unrelatedRequest ? ownerA : ownerB } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    let mission: any;
    await browser.route("**/api/v1/owner/missions", async route => {
      if (unrelatedRequest) return route.fulfill({ status: 409, json: { error: { code: "WATCHLIST_LIMIT_REACHED" } } });
      mission = { ...JSON.parse(route.request.postData || "{}"), watchlist_id: missionId, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
      await route.fulfill({ status: 201, json: mission });
    });
    await browser.route(`**/api/v1/owner/missions/${missionId}`, route => route.fulfill({ json: mission }));
    await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, route => route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } }));
    await app.open(pathOne);
    if (unrelatedRequest) {
      await screen.getByRole("button", "Vérifier ma mission").click();
      await screen.getByRole("button", "Confirmer la mission").click();
      await expect(screen.getByRole("button", "Modifier")).toBeEnabled();
      await screen.getByRole("button", "Modifier").click();
      await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
      expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v1"))).toBe(legacy);
      return;
    }
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
    await screen.getByRole("textbox", "Exigences minimales").fill("Nouveau brief B");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await screen.getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
    expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v1"))).toBe(legacy);
  });
}

for (const anonymous of [false, true]) for (const legacyV2 of [false, true]) {
  test(`${anonymous ? "anonymous" : "owned"} drafts preserve distinct sources${legacyV2 ? " while migrating v2" : ""}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    let owner: string | null = anonymous ? null : ownerA;
    if (legacyV2) await browser.addInitScript(({ anonymous, ownerA, sourceOne, savedDraft }) => {
      if (!sessionStorage.getItem("fixture.seeded")) {
        sessionStorage.setItem(`clawdeals:buy-mission-draft:v2:${anonymous ? "anonymous" : ownerA}`, JSON.stringify({ source: sourceOne, at: Date.now() - 10000, draft: savedDraft, ...(anonymous ? {} : { ownerId: ownerA }) }));
        sessionStorage.setItem("fixture.seeded", "yes");
      }
    }, { anonymous, ownerA, sourceOne, savedDraft: draft("Vélo", "Exigences source une") });
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: Boolean(owner), owner_id: owner } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    let mission: any;
    await browser.route("**/api/v1/owner/missions", async route => {
      mission = { ...JSON.parse(route.request.postData || "{}"), watchlist_id: missionId, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
      await route.fulfill({ status: 201, json: mission });
    });
    await browser.route(`**/api/v1/owner/missions/${missionId}`, route => route.fulfill({ json: mission }));
    await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, route => route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } }));
    if (!legacyV2) {
      await app.open(pathOne);
      await screen.getByRole("textbox", "Exigences minimales").fill("Exigences source une");
    }
    await app.open(pathTwo);
    await screen.getByRole("textbox", "Exigences minimales").fill("Exigences source deux");
    await app.open(pathOne);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Exigences source une");
    owner = ownerA;
    await screen.getByRole("button", anonymous ? "Continuer" : "Vérifier ma mission").click();
    if (!anonymous && !legacyV2) {
      // Real Pages Router navigation keeps the review mounted while its URL
      // changes. The original submission source must still govern cleanup.
      await browser.evaluate(async url => { await (window as any).next.router.push(url, undefined, { shallow: true }); return null; }, pathTwo);
      await expect(browser).toHaveURL(pathTwo);
    }
    await screen.getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
    await app.open(pathTwo);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Exigences source deux");
    await app.open(pathOne);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
  });
}

for (const knownSource of [false, true]) {
  test(`replaying a ${knownSource ? "source-bound" : "legacy source-unknown"} attempt from another source preserves that draft`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    const request = { ...pending, ...(knownSource ? { draftSource: sourceOne } : {}) };
    const mission = { ...missionPayload(input), watchlist_id: missionId, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
    const writes: { body: string; key: string }[] = [];
    await browser.addInitScript(({ request, ownerA, sourceTwo, savedDraft }) => {
      if (!sessionStorage.getItem("fixture.seeded")) {
        sessionStorage.setItem(`clawdeals:buy-mission-request:v2:${ownerA}`, JSON.stringify(request));
        sessionStorage.setItem(`clawdeals:buy-mission-draft:v2:${ownerA}`, JSON.stringify({ source: sourceTwo, ownerId: ownerA, at: Date.now(), draft: savedDraft }));
        sessionStorage.setItem("fixture.seeded", "yes");
      }
    }, { request, ownerA, sourceTwo, savedDraft: draft("Casque", "Exigences source deux", "50") });
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerA } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    await browser.route("**/api/v1/owner/missions", async route => { writes.push({ body: route.request.postData || "", key: route.request.headers["idempotency-key"] }); await route.fulfill({ status: 201, json: mission }); });
    await browser.route(`**/api/v1/owner/missions/${missionId}`, route => route.fulfill({ json: mission }));
    await browser.route(`**/api/v1/owner/missions/${missionId}/matches`, route => route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } }));
    await app.open(pathTwo);
    await screen.getByRole("button", "Vérifier ma mission").click();
    await expect(screen.getByTestId("buy-mission-summary")).toContainText("Tentative envoyée");
    await screen.getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
    expect(writes).toEqual([{ body: pending.fingerprint, key: pending.key }]);
    await app.open(pathTwo);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Exigences source deux");
  });
}

test("a returning owner continues the newer anonymous brief for the same source", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let owner: string | null = ownerA;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: Boolean(owner), owner_id: owner } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await app.open(pathOne);
  await screen.getByRole("textbox", "Exigences minimales").fill("Ancienne version du compte A");
  owner = null;
  await browser.reload();
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
  await screen.getByRole("textbox", "Exigences minimales").fill("Nouvelle continuation anonyme");
  owner = ownerA;
  await browser.reload();
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Nouvelle continuation anonyme");
  await screen.getByRole("button", "Vérifier ma mission").click();
  await expect(screen.getByTestId("buy-mission-summary")).toContainText("Nouvelle continuation anonyme");
  await expect(screen.getByTestId("buy-mission-summary")).not.toContainText("Ancienne version");
});
