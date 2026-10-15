import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { missionPayload } from "../../src/ui/my-missions/missionClient";
import type { BuyMissionInput } from "../../src/ui/webmcp/BuyMissionPanel";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const missionA = "33333333-3333-4333-8333-333333333333";
const missionB = "44444444-4444-4444-8444-444444444444";
const path = "/fr/my/missions/new?query=Vélo&price_max=80";

for (const legacy of [false, true]) {
  test(`an unknown owner A mission survives owner B creation and exact replay${legacy ? " from legacy storage" : ""}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    let owner: string | null = ownerA;
    const writes: { owner: string; body: string; key: string }[] = [];
    const missions = new Map<string, Record<string, unknown>>();
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: Boolean(owner), owner_id: owner } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    await browser.route("**/api/v1/owner/missions", async route => {
      const write = { owner: route.request.headers["x-expected-owner-id"], body: route.request.postData || "", key: route.request.headers["idempotency-key"] };
      writes.push(write);
      const id = owner === ownerA ? missionA : missionB;
      if (!missions.has(id)) missions.set(id, { ...JSON.parse(write.body), watchlist_id: id, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() });
      if (writes.length === 1) return route.abort();
      await route.fulfill({ status: 201, body: JSON.stringify(missions.get(id)), contentType: "application/json" });
    });
    await browser.route("**/api/v1/owner/missions/*", route => {
      const id = new URL(route.request.url).pathname.split("/").at(-1)!;
      return route.fulfill({ body: JSON.stringify(missions.get(id) || {}), contentType: "application/json" });
    });
    await browser.route("**/api/v1/owner/missions/*/matches*", route => route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } }));
    await app.open(path);
    await screen.getByRole("textbox", "Exigences minimales").fill("Brief privé A");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await screen.getByRole("button", "Confirmer la mission").click();
    await expect.poll(() => writes.length).toBe(1);
    await expect(screen.getByRole("button", "Confirmer la mission")).toBeEnabled();
    await expect(screen.getByRole("button", "Modifier")).toBeDisabled();
    if (legacy) await browser.evaluate(id => {
      const scoped = `clawdeals:buy-mission-request:v2:${id}`;
      const saved = sessionStorage.getItem(scoped);
      if (saved) { sessionStorage.setItem("clawdeals:buy-mission-request:v1", saved); sessionStorage.removeItem(scoped); }
      const draftKey = `clawdeals:buy-mission-draft:v2:${id}`;
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (draft) { delete draft.ownerId; sessionStorage.setItem("clawdeals:buy-mission-draft:v1", JSON.stringify(draft)); sessionStorage.removeItem(draftKey); }
      return null;
    }, ownerA);

    if (legacy) {
      owner = null;
      await app.open("/fr/my/missions/new?query=Casque&price_max=50");
      await screen.getByRole("textbox", "Exigences minimales").fill("Nouveau brief anonyme");
      await screen.getByRole("button", "Continuer").click();
      await expect(screen.getByTestId("auth-login-email")).toBeVisible();
      expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-request:v1"))).toContain(writes[0].key);
    }
    owner = ownerB;
    await app.open("/fr/my/missions/new?query=Casque&price_max=50");
    if (legacy) await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Nouveau brief anonyme");
    await screen.getByRole("textbox", "Exigences minimales").fill("Brief privé B");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await expect(screen.getByTestId("buy-mission-summary")).not.toContainText("Brief privé A");
    await screen.getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionB}`);
    expect(writes[1].owner).toBe(ownerB);
    expect(writes[1].key).not.toBe(writes[0].key);

    owner = ownerA;
    await app.open(path);
    await screen.getByRole("button", "Vérifier ma mission").click();
    await screen.getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionA}`);
    expect(writes).toHaveLength(3);
    expect(writes[2]).toEqual(writes[0]);
    expect(missions.size).toBe(2);
    expect(await browser.evaluate(id => sessionStorage.getItem(`clawdeals:buy-mission-request:v2:${id}`), ownerA)).toBeNull();
    expect(await browser.evaluate(id => sessionStorage.getItem(`clawdeals:buy-mission-request:v2:${id}`), ownerB)).toBeNull();
    expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-request:v1"))).toBeNull();
    await app.screenshot("mission-owner-A-exact-replay");
  });
}

test("a changed owner cannot submit or restore the previous owner's mounted draft", async ({ app, browser, screen }) => {
  let owner = ownerA;
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: Boolean(owner), owner_id: owner } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await app.open(path);
  await screen.getByRole("textbox", "Exigences minimales").fill("Brief privé A");
  owner = ownerB;
  await screen.getByRole("button", "Vérifier ma mission").click();
  await expect(screen.getByTestId("new-mission-page").getByRole("alert")).toContainText("compte a changé");
  await expect(screen.getByRole("button", "Confirmer la mission")).toHaveCount(0);
  await screen.getByRole("button", "Réessayer").click();
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
  await screen.getByRole("textbox", "Exigences minimales").fill("Brief privé B");
  owner = ownerA;
  await browser.reload();
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Brief privé A");
});

for (const mode of ["expired", "migration-write-fails", "confirmed-remove-fails", "legacy-rejected"]) {
  test(`an already sent mission retains exact recovery when ${mode}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    const input: BuyMissionInput = {
      query: "Vélo déjà envoyé", market_code: "FR", location_label: "Paris", latitude: 48.85, longitude: 2.35,
      radius_km: 25, preferred_price_max: 75, hard_budget_max: 80, requirements: ["Brief envoyé"],
      autonomous_actions: ["search"], contact_reveal: "manual_bilateral_approval", expires_at: "2020-01-01T12:00:00.000Z"
    };
    const body = missionPayload(input);
    const saved = { input, ownerId: ownerA, key: "55555555-5555-4555-8555-555555555555", fingerprint: JSON.stringify(body) };
    const mission = { ...body, watchlist_id: missionA, currency: "EUR", status: "EXPIRED", created_at: "2019-12-30T12:00:00.000Z" };
    const writes: { body: string; key: string }[] = [];
    let owner = ownerA;
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: owner } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    await browser.route("**/api/v1/owner/missions", async route => {
      writes.push({ body: route.request.postData || "", key: route.request.headers["idempotency-key"] });
      if (mode === "legacy-rejected") return route.fulfill({ status: 409, json: { error: { code: "WATCHLIST_LIMIT_REACHED" } } });
      await route.fulfill({ status: 201, json: mission });
    });
    await browser.route(`**/api/v1/owner/missions/${missionA}`, route => route.fulfill({ json: mission }));
    await browser.route(`**/api/v1/owner/missions/${missionA}/matches`, route => route.fulfill({ json: { items: [], next_cursor: null, status: "EXPIRED" } }));
    await browser.addInitScript(({ saved, mode }) => {
      const ownerKey = `clawdeals:buy-mission-request:v2:${saved.ownerId}`;
      if (!sessionStorage.getItem("fixture.seeded")) {
        sessionStorage.setItem(mode === "migration-write-fails" || mode === "legacy-rejected" ? "clawdeals:buy-mission-request:v1" : ownerKey, JSON.stringify(saved));
        if (mode === "legacy-rejected") sessionStorage.setItem("clawdeals:buy-mission-draft:v1", JSON.stringify({
          source: 'search:["Vélo","80"]', at: Date.now(), draft: {
            query: "Vélo", marketCode: "FR", cityPreset: "paris", locationLabel: "Paris", latitude: "48.85", longitude: "2.35",
            radiusKm: "25", preferredPriceMax: "75", hardBudgetMax: "80", requirements: "Privé legacy A", autonomousActions: ["search"], expiresAt: "2020-01-01T12:00"
          }
        }));
        sessionStorage.setItem("fixture.seeded", "yes");
      }
      const set = Storage.prototype.setItem;
      const remove = Storage.prototype.removeItem;
      (window as any).__restoreStorage = () => { Storage.prototype.setItem = set; Storage.prototype.removeItem = remove; };
      if (mode === "migration-write-fails") Storage.prototype.setItem = function(key, value) { if (key !== ownerKey) set.call(this, key, value); };
      if (mode === "confirmed-remove-fails") Storage.prototype.removeItem = function(key) { if (key !== ownerKey) remove.call(this, key); };
    }, { saved, mode });
    await app.open(path);
    if (mode === "migration-write-fails") {
      await expect(screen.getByTestId("new-mission-page").getByRole("alert")).toContainText("Active le stockage");
      expect(writes).toHaveLength(0);
      expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-request:v1"))).toBe(JSON.stringify(saved));
      await browser.evaluate(() => { (window as any).__restoreStorage(); return null; });
      await screen.getByRole("button", "Réessayer").click();
    }
    await screen.getByRole("button", "Vérifier ma mission").click();
    await expect(screen.getByTestId("buy-mission-summary")).toContainText("Brief envoyé");
    await screen.getByRole("button", "Confirmer la mission").click();
    if (mode === "legacy-rejected") {
      await expect(screen.getByRole("button", "Modifier")).toBeEnabled();
      expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-request:v1"))).toBeNull();
      await screen.getByRole("button", "Modifier").click();
      await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Privé legacy A");
      owner = ownerB;
      await browser.reload();
      await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
      expect(writes).toHaveLength(1);
      return;
    }
    await expect(browser).toHaveURL(`/fr/my/missions/${missionA}`);
    expect(writes).toEqual([{ body: saved.fingerprint, key: saved.key }]);
    if (mode === "confirmed-remove-fails") {
      expect(await browser.evaluate(id => sessionStorage.getItem(`clawdeals:buy-mission-request:v2:${id}`), ownerA)).toBe(JSON.stringify(saved));
      await app.open(path);
      await browser.evaluate(() => { (window as any).__restoreStorage(); return null; });
      await screen.getByRole("button", "Vérifier ma mission").click();
      await screen.getByRole("button", "Confirmer la mission").click();
      await expect(browser).toHaveURL(`/fr/my/missions/${missionA}`);
      expect(writes[1]).toEqual(writes[0]);
    }
    expect(await browser.evaluate(id => sessionStorage.getItem(`clawdeals:buy-mission-request:v2:${id}`), ownerA)).toBeNull();
    expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-request:v1"))).toBeNull();
    // Renewal makes a new, owner-scoped draft with a future expiration.
    await screen.getByRole("button", "Repartir de ces critères").click();
    await expect(browser).toHaveURL(`/fr/my/missions/new?from=${missionA}`);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Brief envoyé");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await expect(screen.getByRole("button", "Confirmer la mission")).toBeEnabled();
  });
}

test("an anonymous draft is claimed once when authentication changes before review", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let owner: string | null = null;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: Boolean(owner), owner_id: owner } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await app.open(path);
  await screen.getByRole("textbox", "Exigences minimales").fill("Premier propriétaire du brouillon");
  owner = ownerA;
  await screen.getByRole("button", "Continuer").click();
  await expect(screen.getByRole("button", "Confirmer la mission")).toBeVisible();
  owner = ownerB;
  await browser.reload();
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("");
  owner = ownerA;
  await browser.reload();
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Premier propriétaire du brouillon");
});
