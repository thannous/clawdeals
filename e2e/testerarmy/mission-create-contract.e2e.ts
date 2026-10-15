import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "33333333-3333-4333-8333-333333333333";
const MISSION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_KEY = "clawdeals:buy-mission-request:v1";

for (const corruption of ["missing-criteria", "missing-mission", "invalid-location", "invalid-autonomy"]) {
  test(`mission recovery survives a successful response with ${corruption}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    const writes: { key: string; body: string }[] = [];
    let mission: any;
    await browser.route("**/*", async route => {
      if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: OWNER_A } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    await browser.route("**/api/v1/owner/missions", async route => {
      const write = { key: route.request.headers["idempotency-key"], body: route.request.postData || "" };
      writes.push(write);
      mission ||= { ...JSON.parse(write.body), watchlist_id: MISSION_ID, currency: "EUR", status: "ACTIVE", created_at: new Date().toISOString() };
      const response = structuredClone(mission);
      if (writes.length === 1) {
        if (corruption === "missing-criteria") delete response.criteria;
        if (corruption === "missing-mission") delete response.criteria.mission;
        if (corruption === "invalid-location") response.criteria.mission.location = { label: { unexpected: true } };
        if (corruption === "invalid-autonomy") response.criteria.mission.autonomous_actions = "search";
      } else expect(write).toEqual(writes[0]);
      await route.fulfill({ status: 201, json: response });
    });
    await browser.route(`**/api/v1/owner/missions/${MISSION_ID}`, route => route.fulfill({ json: mission }));
    await browser.route(`**/api/v1/owner/missions/${MISSION_ID}/matches`, route => route.fulfill({ json: { items: [], next_cursor: null, status: "ACTIVE" } }));
    await app.open("/fr/my/missions/new?query=Vélo%20pliant&price_max=83.25");
    await screen.getByRole("textbox", "Exigences minimales").fill("Brief privé à conserver");
    await screen.getByRole("button", "Vérifier ma mission").click();
    const review = screen.getByRole("region", "Vérifier ma mission");
    await review.getByRole("button", "Confirmer la mission").click();
    await expect.poll(() => writes.length).toBe(1);
    await expect(review.getByRole("button", "Confirmer la mission")).toBeEnabled();
    const saved = await browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null"), REQUEST_KEY);
    expect(saved).toMatchObject({ ownerId: OWNER_A, key: writes[0].key, fingerprint: writes[0].body });
    await expect(review.getByRole("alert")).toBeVisible();
    await expect(review.getByRole("button", "Modifier")).toBeDisabled();
    await app.screenshot(`mission-${corruption}-recovery-retained`);
    await browser.reload();
    await screen.getByRole("button", "Vérifier ma mission").click();
    await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
    await expect(browser).toHaveURL(`/fr/my/missions/${MISSION_ID}`);
    await expect(screen.getByTestId("buy-mission-summary")).toContainText("Brief privé à conserver");
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(await browser.evaluate(key => sessionStorage.getItem(key), REQUEST_KEY)).toBeNull();
  });
}

for (const priorUncertain of [false, true]) {
  test(`mission POST binds the confirmed account across a cookie race${priorUncertain ? " during recovery" : ""}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    let cookieOwner = OWNER_A;
    const writes: { owner: string; key: string; body: string }[] = [];
    const insertedOwners: string[] = [];
    await browser.route("**/*", async route => {
      if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    // The probe succeeds as A; the modeled cookie changes before the POST.
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: OWNER_A } } }));
    await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
    await browser.route("**/api/v1/owner/missions", async route => {
      const write = { owner: route.request.headers["x-expected-owner-id"], key: route.request.headers["idempotency-key"], body: route.request.postData || "" };
      writes.push(write);
      if (write.owner !== cookieOwner) {
        await route.fulfill({ status: 403, json: { error: { code: "OWNER_SESSION_CHANGED" } } });
      } else {
        if (!insertedOwners.length) insertedOwners.push(cookieOwner);
        await route.abort();
      }
    });
    await app.open("/fr/my/missions/new?query=Vélo%20pliant&price_max=83.25");
    await screen.getByRole("button", "Vérifier ma mission").click();
    const review = screen.getByRole("region", "Vérifier ma mission");
    if (priorUncertain) {
      await review.getByRole("button", "Confirmer la mission").click();
      await expect.poll(() => writes.length).toBe(1);
      await expect(review.getByRole("button", "Confirmer la mission")).toBeEnabled();
      await expect(review.getByRole("button", "Modifier")).toBeDisabled();
    }
    cookieOwner = OWNER_B;
    await review.getByRole("button", "Confirmer la mission").click();
    await expect(review.getByRole("alert")).toContainText("compte a changé");
    expect(writes.at(-1)!.owner).toBe(OWNER_A);
    expect(insertedOwners).toEqual(priorUncertain ? [OWNER_A] : []);
    const previous = writes.at(-1)!;
    if (priorUncertain) {
      expect(previous).toEqual(writes[0]);
      await expect(review.getByRole("button", "Modifier")).toBeDisabled();
      const saved = await browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null"), REQUEST_KEY);
      expect(saved).toMatchObject({ ownerId: OWNER_A, key: previous.key, fingerprint: previous.body });
    }
    await app.screenshot(`mission-cookie-race-${priorUncertain ? "recovery" : "initial"}`);
    cookieOwner = OWNER_A;
    await review.getByRole("button", "Confirmer la mission").click();
    await expect.poll(() => writes.length).toBe(priorUncertain ? 3 : 2);
    expect(writes.at(-1)!.owner).toBe(OWNER_A);
    if (priorUncertain) expect(writes.at(-1)).toEqual(writes[0]);
    expect(insertedOwners).toEqual([OWNER_A]);
  });
}
