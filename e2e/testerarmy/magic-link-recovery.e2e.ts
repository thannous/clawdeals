import { test, surfaceOf } from "@e2e-dev/web";
import { expect } from "e2e";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { desktopEngine, mobileEngine } from "./web-engines";

// A real second browser tab has separate sessionStorage and shared session
// cookies. Only email delivery/session APIs are modeled: no email is sent.
test("a magic link in a separate tab preserves the private draft in its original tab", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let authenticated = false;
  const sends: { email: string; next: string }[] = [];
  await browser.route("**/*", async route => {
    if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
    else await route.abort();
  });
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: {
    authenticated, ...(authenticated ? { owner_id: "11111111-1111-4111-8111-111111111111" } : {})
  } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await browser.route("**/api/v1/auth/login:start", async route => {
    sends.push(JSON.parse(route.request.postData || "{}"));
    await route.fulfill({ status: 201, json: { data: { session_id: "synthetic-session", session_token: "synthetic-token" } } });
  });
  await browser.route("**/api/v1/auth/login:confirm", async route => {
    authenticated = true;
    await route.fulfill({ json: { data: { authenticated: true } } });
  });
  const missionPath = "/fr/my/missions/new?query=velo&price_max=83.25";
  await app.open(missionPath);
  await screen.getByRole("textbox", "Exigences minimales").fill("Mon brouillon privé, cadre bas et panier");
  await screen.getByRole("spinbutton", "Prix préféré").fill("75.50");
  await screen.getByRole("button", "Continuer").click();
  await screen.getByTestId("auth-login-legacy-link").click();
  await expect(browser).toHaveURL(/\/fr\/auth\/login-legacy\?/);
  await screen.getByTestId("auth-login-email").fill("synthetic-owner@example.test");
  await screen.getByTestId("auth-login-submit").click();
  await expect(screen.getByTestId("auth-login-resume-mission")).toBeVisible();
  expect(sends).toEqual([{ email: "synthetic-owner@example.test", next: missionPath }]);
  const originalDraft = await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"));
  expect(originalDraft).toContain("Mon brouillon privé");

  // The engine's browser fixture exposes one active tab. Its supported surface
  // gives this attempt a second real page while retaining the original screen.
  const width = await browser.evaluate(() => window.innerWidth);
  const surface = surfaceOf(width === 390 ? mobileEngine : desktopEngine)!;
  const emailTab = await surface.context().newPage();
  try {
    const emailUrl = `${origin}/fr/auth/verify?session_id=synthetic-session&token=synthetic-token&next=${encodeURIComponent(sends[0].next)}`;
    await emailTab.goto(emailUrl);
    expect(await emailTab.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"))).toBeNull();
    await emailTab.getByTestId("auth-verify-resend").click();
    await expect.poll(() => sends.length).toBe(2);
    expect(sends[1]).toEqual(sends[0]);
    await emailTab.getByTestId("auth-verify-submit").click();
    await emailTab.getByRole("link", { name: "Ouvrir la mission ici sans mon brouillon" }).waitFor();
    expect(await emailTab.getByTestId("auth-verify-success").innerText()).toContain("Reviens dans l’onglet où tu préparais ta mission");
    expect(new URL(emailTab.url()).pathname).toBe("/fr/auth/verify");
    expect(await emailTab.getByRole("link", { name: "Ouvrir la mission ici sans mon brouillon" }).getAttribute("href")).toBe(missionPath);
    const folder = join(process.env.PARITY_OUTPUT || ".e2e", "handoff-screenshots");
    await mkdir(folder, { recursive: true });
    await emailTab.screenshot({ path: join(folder, `magic-link-independent-tab-${width}.png`), fullPage: true });
    expect(await emailTab.evaluate(() => localStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"))).toBeNull();
    expect(emailTab.url()).not.toContain("brouillon");
    expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D"))).toBe(originalDraft);
    await screen.getByTestId("auth-login-resume-mission").click();
    await expect(browser).toHaveURL(missionPath);
    await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Mon brouillon privé, cadre bas et panier");
    await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("75.50");
    await screen.getByRole("button", "Vérifier ma mission").click();
    await expect(screen.getByRole("region", "Vérifier ma mission")).toContainText("Mon brouillon privé");
    await expect(screen.getByRole("region", "Vérifier ma mission")).toContainText("cadre bas et panier");
    await app.screenshot("magic-link-original-tab-draft-restored");
  } finally {
    await emailTab.close();
  }
});

// An already owned draft must also survive reauthentication in its original tab.
test("a same-tab magic link restores only the reconnecting owner's mission draft", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  const ownerId = "11111111-1111-4111-8111-111111111111";
  let authenticated = true;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated, owner_id: authenticated ? ownerId : null } } }));
  await browser.route("**/api/v1/policies", route => route.fulfill({ json: { data: {} } }));
  await browser.route("**/api/v1/auth/login:confirm", async route => { authenticated = true; await route.fulfill({ json: { data: { authenticated: true } } }); });
  const next = "/fr/my/missions/new?query=velo&price_max=83.25";
  await app.open(next);
  await screen.getByRole("textbox", "Exigences minimales").fill("Brouillon privé du propriétaire reconnecté");
  authenticated = false;
  await screen.getByRole("button", "Vérifier ma mission").click();
  await expect(screen.getByTestId("auth-login-email")).toBeVisible();
  await app.open(`/fr/auth/verify?session_id=synthetic-session&token=synthetic-token&next=${encodeURIComponent(next)}`);
  await screen.getByTestId("auth-verify-submit").click();
  await expect(browser).toHaveURL(next);
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Brouillon privé du propriétaire reconnecté");
});
