import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("a listing keeps its asking price and its edited draft through a localized sign-in", async ({ app, browser, screen }) => {
  await browser.route("**/api/v1/auth/session", async route => {
    await route.fulfill({ status: 200, json: { data: { authenticated: false } } });
  });
  await app.open("/fr/my/missions/new?listing=11111111-1111-4111-8111-111111111111&title=Velo%20pliant&price=75.50&market=FR&lat=48.85&lng=2.35");
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("75.5");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("75.5");
  await expect(screen.getByRole("spinbutton", "Latitude")).not.toBeVisible();
  await expect(screen.getByTestId("buy-mission-autonomy")).not.toBeVisible();
  await screen.getByRole("spinbutton", "Plafond absolu").fill("80.25");
  await screen.getByRole("textbox", "Exigences minimales").fill("Cadre bas, panier amovible");
  await screen.getByRole("spinbutton", "Rayon en km").fill("12");
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await screen.getByRole("checkbox", "Poser des questions au vendeur").check();
  await screen.getByRole("button", "Continuer").click();
  await expect(screen.getByTestId("auth-login-page")).toBeVisible();
  await expect(screen.getByRole("heading", /Connecte-toi pour retrouver ta mission/)).toBeVisible();
  await app.screenshot("mission-sign-in-context");
  await screen.getByRole("button", "Créer un compte").click();
  await expect(screen.getByLabel("Mot de passe")).toBeVisible();
  await screen.getByRole("link", "Revenir à mon brouillon").click();
  await expect(browser).toHaveURL(/\/fr\/my\/missions\/new\?/);
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue("Velo pliant");
  await browser.reload();
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue("Velo pliant");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("80.25");
  await expect(screen.getByRole("textbox", "Exigences minimales")).toHaveValue("Cadre bas, panier amovible");
  await expect(screen.getByRole("spinbutton", "Rayon en km")).toHaveValue("12");
  await expect(screen.getByTestId("buy-mission-autonomy")).not.toBeVisible();
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await expect(screen.getByRole("checkbox", "Poser des questions au vendeur")).toBeChecked();
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await app.screenshot("listing-draft-recovered");
});

test("the purchase draft survives a visit to sign-in and return", async ({ app, browser, screen }) => {
  await app.open("/fr/my/missions/new");
  await screen.getByRole("textbox", "Objet recherché").fill("Vélo pliant brouillon");
  await screen.getByRole("spinbutton", "Prix préféré").fill("75.50");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("83.25");
  await screen.getByTestId("buy-mission-city").selectOption({ value: "lyon" });
  await app.open("/auth/login?next=%2Ffr%2Fmy%2Fmissions%2Fnew");
  await expect(screen.getByTestId("auth-login-page")).toBeVisible();
  await browser.back();
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue("Vélo pliant brouillon");
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("75.50");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("83.25");
  await expect(screen.getByTestId("buy-mission-city")).toHaveValue("lyon");
});

test("the same search with a new budget starts a distinct draft", async ({ app, screen }) => {
  await app.open("/fr/my/missions/new?query=Vélo&price_max=100");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("100");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("125");
  await app.open("/fr/my/missions/new?query=Vélo&price_max=200");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("200");
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("200");
});
