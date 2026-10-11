import { test } from "@e2e-dev/web";
import { expect } from "e2e";

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
