import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { credentials, expect } from "e2e";
import { test } from "./fixtures";

// Opt in deliberately: this single comparison consumes the local ChatGPT plan.
test("a real mission compares its matching listing with the local ChatGPT subscription", {
  trace: "off", video: "off", timeout: 240000,
  skip: process.env.TESTERARMY_CHATGPT_LOCAL !== "1" ? "Requires the explicit local ChatGPT pilot" : false
}, async ({ app, browser, screen, missionFixture }) => {
  expect(new URL(app.baseUrl!).hostname).toBe("127.0.0.1");
  const listing = await missionFixture.createListing("GB", 75);
  await app.open(`/fr/browse/${listing.id}`);
  await screen.getByTestId("listing-ask-agent").click();
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(listing.title);
  await screen.getByRole("button", "Continuer").click();
  await expect(screen.getByTestId("auth-login-page")).toBeVisible();
  await screen.getByLabel("Email").fill(missionFixture.email);
  await screen.getByLabel("Mot de passe").fill(credentials.user("mission").password);
  await screen.getByTestId("auth-login-submit").click();
  await expect(screen.getByRole("button", "Vérifier ma mission")).toBeEnabled();
  await screen.getByRole("button", "Vérifier ma mission").click();
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  await expect(screen.getByTestId("owner-mission-detail")).toBeVisible();
  await expect(screen.getByTestId("mission-matches").getByRole("heading", listing.title)).toBeVisible();
  const missionPath = new URL(await browser.url()).pathname;
  const section = screen.getByTestId("mission-chatgpt");
  await expect(section.getByRole("button", "Continuer avec ChatGPT")).toBeEnabled();
  await section.getByRole("button", "Continuer avec ChatGPT").click();
  await expect(browser).toHaveURL(missionPath);
  await expect(screen.getByTestId("chatgpt-connected")).toBeVisible();
  const state = await browser.evaluate(async () => {
    const session = await fetch("/api/v1/auth/session", { credentials: "include", cache: "no-store" });
    const owner = await session.json();
    const result = await fetch("/api/local/chatgpt", { credentials: "include", headers: { "X-Expected-Owner-Id": owner.data.owner_id }, cache: "no-store" });
    const body = await result.json();
    return { status: result.status, connected: body.connected, models: body.models };
  });
  expect(state.status).toBe(200);
  expect(state.connected).toBe(true);
  expect(state.models.length).toBeGreaterThan(0);
  await expect(section.getByRole("combobox", "Modèle")).toHaveValue(state.models[0].id);
  const completed = browser.waitForResponse("**/api/local/chatgpt");
  await section.getByRole("button", "Comparer les annonces").click();
  const response = await completed;
  const result = await response.json() as { completed?: boolean; text?: string; model?: string; listingCount?: number };
  expect(response.status).toBe(200);
  expect(result.completed).toBe(true);
  expect(result.listingCount).toBe(1);
  expect(result.model).toBe(state.models[0].id);
  expect(result.text).toContain(listing.id);
  await expect(screen.getByTestId("chatgpt-analysis")).toContainText(listing.id);
  expect(await browser.evaluate(() => Object.keys(localStorage).some(key => /chatgpt|openai/i.test(key)))).toBe(false);
  await browser.reload();
  await expect(screen.getByTestId("chatgpt-connected")).toBeVisible();
  await expect(screen.getByTestId("chatgpt-analysis")).not.toBeVisible();
  // Exercise the HTTP boundary directly; browsers control the Origin header.
  // Keep the fixture cookie in memory only, with all network traces disabled.
  const cookieName = process.env.OWNER_SESSION_COOKIE_NAME || "cd_owner_session";
  const cookie = (await browser.cookies()).find(item => item.name === cookieName);
  expect(Boolean(cookie)).toBe(true);
  const crossOrigin = await fetch(new URL("/api/local/chatgpt", app.baseUrl), { method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.invalid", Cookie: `${cookieName}=${cookie!.value}`,
      "Idempotency-Key": randomUUID(), "X-Expected-Owner-Id": missionFixture.missionWrites[0].expectedOwnerId },
    body: JSON.stringify({ action: "analyze", missionId: missionPath.split("/").pop(), model: state.models[0].id }) });
  expect(crossOrigin.status).toBe(403);
  expect((await crossOrigin.json()).error?.code).toBe("INVALID_ORIGIN");
  const empty = JSON.parse(missionFixture.missionWrites[0].body);
  empty.criteria.query = `Introuvable ${missionFixture.id}`;
  const noMatches = await browser.evaluate(async ({ body, model }) => {
    const session = await (await fetch("/api/v1/auth/session", { credentials: "include" })).json();
    const headers = () => ({ "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-Expected-Owner-Id": session.data.owner_id });
    const created = await fetch("/api/v1/owner/missions", { method: "POST", credentials: "include", headers: headers(), body: JSON.stringify(body) });
    const mission = await created.json();
    if (created.status !== 201) return { status: created.status, code: mission.error?.code ?? null };
    const response = await fetch("/api/local/chatgpt", { method: "POST", credentials: "include", headers: headers(),
      body: JSON.stringify({ action: "analyze", missionId: mission.watchlist_id, model }) });
    return { status: response.status, code: (await response.json()).error?.code ?? null };
  }, { body: empty, model: state.models[0].id });
  expect(noMatches).toEqual({ status: 409, code: "NO_MATCHES" });
  const anonymous = await fetch(new URL("/api/local/chatgpt", app.baseUrl));
  expect(anonymous.status).toBe(401);
  // The local bridge itself must reject another owner before any model request.
  const key = await readFile("test-results/chatgpt-local/private/bridge-key", "utf8");
  const rejected = await fetch(`http://127.0.0.1:${process.env.CLAWDEALS_CHATGPT_LOCAL_PORT || 4318}/bridge`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "analyze", ownerId: randomUUID(), model: result.model })
  });
  expect(rejected.status).toBe(401);
  expect((await rejected.json()).error.code).toBe("PLAN_PERMISSION_REQUIRED");
});
