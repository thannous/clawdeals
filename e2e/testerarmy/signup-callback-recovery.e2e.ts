import { test, surfaceOf } from "@e2e-dev/web";
import { expect } from "e2e";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { desktopEngine, mobileEngine } from "./web-engines";

const ownerId = "11111111-1111-4111-8111-111111111111";
const user = { id: ownerId, aud: "authenticated", role: "authenticated", email: "synthetic-owner@example.test", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-10-15T08:00:00Z" };
function callbackHash() {
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: ownerId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "synthetic-signature"].join(".");
  return `#access_token=${token}&refresh_token=synthetic-refresh-token&expires_in=3600&token_type=bearer&type=signup`;
}

// The actual Supabase browser client parses the callback; all auth network
// responses and owner sessions are fixtures. No signup or email is sent.
test("signup email in an independent tab returns to the original private mission draft", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let authenticated = false;
  let signupCallback: string | null = null;
  let bridgeCalls = 0;
  const writes: string[] = [];
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/auth/v1/signup**", async route => {
    signupCallback = new URL(route.request.url).searchParams.get("redirect_to");
    await route.fulfill({ json: { user, session: null } });
  });
  await browser.route("**/auth/v1/user**", route => route.fulfill({ json: user }));
  await browser.route("**/api/v1/auth/session:bridge", async route => {
    bridgeCalls += 1;
    authenticated = true;
    await route.fulfill({ json: { data: { authenticated: true } } });
  });
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated, owner_id: authenticated ? ownerId : null } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await browser.route("**/api/v1/buy-missions**", async route => {
    if (route.request.method === "POST") writes.push(route.request.postData || "");
    await route.abort();
  });
  const missionPath = "/fr/my/missions/new?query=velo&price_max=83.25";
  await app.open(missionPath);
  await screen.getByRole("textbox", "Exigences minimales").fill("Brouillon privé inscription : panier et cadre bas");
  await screen.getByRole("spinbutton", "Prix préféré").fill("75.50");
  await screen.getByRole("button", "Continuer").tap();
  await screen.getByRole("button", "Créer un compte", { exact: true }).tap();
  await screen.getByTestId("auth-login-email").fill(user.email);
  await screen.getByTestId("auth-login-password").fill("Synthetic-password-42!");
  await screen.getByTestId("auth-login-submit").tap();
  await expect(screen.getByTestId("auth-login-notice")).toBeVisible();
  expect(signupCallback).not.toBeNull();
  expect(new URL(signupCallback!).pathname).toBe("/auth/callback");
  expect(new URL(signupCallback!).searchParams.get("next")).toBe(missionPath);
  const originalDraft = await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"));
  expect(originalDraft).toContain("Brouillon privé inscription");
  const width = await browser.evaluate(() => window.innerWidth);
  const surface = surfaceOf(width === 390 ? mobileEngine : desktopEngine)!;
  const emailTab = await surface.context().newPage();
  try {
    await emailTab.goto(signupCallback! + callbackHash());
    expect(await emailTab.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"))).toBeNull();
    const openWithoutDraft = emailTab.getByRole("link", { name: "Ouvrir la mission ici sans mon brouillon" });
    await openWithoutDraft.waitFor();
    expect(await openWithoutDraft.getAttribute("href")).toBe(missionPath);
    expect(await emailTab.getByTestId("auth-callback-mission-return").innerText()).toContain("Reviens dans l’onglet où tu préparais ta mission");
    expect(new URL(emailTab.url()).pathname).toBe("/fr/auth/callback");
    expect(await emailTab.evaluate(() => localStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"))).toBeNull();
    expect(emailTab.url()).not.toContain("Brouillon");
    const folder = join(process.env.PARITY_OUTPUT || ".e2e", "handoff-screenshots");
    await mkdir(folder, { recursive: true });
    await emailTab.locator("body").waitFor({ state: "visible" });
    await emailTab.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await emailTab.getByTestId("auth-callback-mission-return").waitFor({ state: "visible" });
    expect(bridgeCalls).toBe(1);
    await emailTab.screenshot({ path: join(folder, `signup-independent-tab-${width}.png`), fullPage: true });
    expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"))).toBe(originalDraft);
    await screen.getByTestId("auth-login-resume-mission").tap();
    await expect(browser).toHaveURL(missionPath);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Brouillon privé inscription : panier et cadre bas");
    await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("75.50");
    await screen.getByRole("button", "Vérifier ma mission").tap();
    await expect(screen.getByRole("region", "Vérifier ma mission")).toContainText("Brouillon privé inscription");
    expect(writes).toHaveLength(0);
  } finally { await emailTab.close(); }
});

for (const initiallyAuthenticated of [false, true]) test(`signup callback in the original tab resumes its ${initiallyAuthenticated ? "owned" : "anonymous"} matching draft automatically`, async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let authenticated = initiallyAuthenticated;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/auth/v1/user**", route => route.fulfill({ json: user }));
  await browser.route("**/api/v1/auth/session:bridge", async route => {
    authenticated = true;
    await route.fulfill({ json: { data: { authenticated: true } } });
  });
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated, owner_id: authenticated ? ownerId : null } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  const missionPath = "/fr/my/missions/new?query=velo&price_max=83.25";
  await app.open(missionPath);
  await screen.getByRole("textbox", "Exigences minimales").fill("Brouillon dans le même onglet");
  await screen.getByRole("spinbutton", "Prix préféré").fill("72.50");
  authenticated = false;
  await screen.getByRole("button", initiallyAuthenticated ? "Vérifier ma mission" : "Continuer").tap();
  await expect(screen.getByTestId("auth-login-email")).toBeVisible();
  await app.open(`/auth/callback?next=${encodeURIComponent(missionPath)}${callbackHash()}`);
  await expect(browser).toHaveURL(missionPath);
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Brouillon dans le même onglet");
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("72.50");
  await expect(screen.getByTestId("auth-callback-mission-return")).toHaveCount(0);
});
