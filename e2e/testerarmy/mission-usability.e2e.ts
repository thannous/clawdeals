import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("a conflicting budget explains the correction and focuses the field without losing the draft", async ({ app, browser, screen }) => {
  await browser.route("**/api/v1/auth/session", async route => {
    await route.fulfill({ json: { data: { authenticated: false } } });
  });
  await app.open("/fr/my/missions/new?query=Velo&price_max=100");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("50");
  await screen.getByRole("button", "Continuer").click();
  await expect(screen.getByTestId("buy-mission-result")).toContainText("prix préféré");
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toBeFocused();
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveAttribute("aria-invalid", "true");
  expect(await browser.evaluate(() => {
    const field = document.querySelector('[name="preferred_price_max"]')!.getBoundingClientRect();
    const header = document.querySelector("header")!.getBoundingClientRect();
    return field.top >= header.bottom && field.bottom <= window.innerHeight;
  })).toBe(true);
  await app.screenshot("budget-correction");
  await screen.getByRole("spinbutton", "Prix préféré").fill("45");
  await screen.getByRole("button", "Continuer").click();
  await expect(browser).toHaveURL(/\/fr\/auth\/login\?next=/);
  await screen.getByRole("link", "Revenir à mon brouillon").click();
  await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("45");
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("50");
});

test("an expired date opens its collapsed options and identifies the correction", async ({ app, browser, screen }) => {
  await browser.route("**/api/v1/auth/session", async route => {
    await route.fulfill({ json: { data: { authenticated: false } } });
  });
  await app.open("/fr/my/missions/new?query=Velo&price_max=100");
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await browser.locator('[name="expires_at"]').fill("2020-01-01T12:00");
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await screen.getByRole("button", "Continuer").click();
  await expect(screen.getByTestId("buy-mission-result")).toContainText("90 jours");
  await expect(browser.locator('[name="expires_at"]')).toBeVisible();
  await expect(browser.locator('[name="expires_at"]')).toBeFocused();
  await expect(browser).toHaveURL(/\/fr\/my\/missions\/new/);
  await app.screenshot("expiry-correction");
});
