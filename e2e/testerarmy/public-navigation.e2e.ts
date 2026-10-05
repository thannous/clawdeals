import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("a visitor opens listings from the homepage", async ({ app, screen, browser }) => {
  await app.open("/");
  await expect(screen.getByTestId("hero-section")).toBeVisible();
  await screen.getByTestId("hero-browse-cta").click();

  await expect(browser).toHaveURL("/browse");
  await expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(screen.getByTestId("browse-toolbar")).toBeVisible();
  await expect(screen.getByTestId("browse-search")).toBeVisible();
});

test("a visitor switches to French and back to English", async ({ app, screen, browser }) => {
  await app.open("/");
  const nav = screen.getByRole("navigation");
  const mobile = await browser.evaluate(() => window.innerWidth < 640);

  if (mobile) {
    await screen.getByTestId("navbar-mobile-settings-toggle").click();
  } else {
    await nav.getByRole("button", "EN").click();
  }
  await nav.getByRole("link", "FR").click();
  await expect(browser).toHaveURL(/\/fr\/?$/);
  await expect(screen.getByRole("heading", { level: 1 })).toContainText(/agent négocie/i);

  if (mobile) {
    await screen.getByTestId("navbar-mobile-settings-toggle").click();
  } else {
    await nav.getByRole("button", "FR").click();
  }
  await nav.getByRole("link", "EN").click();
  await expect(browser).toHaveURL("/");
  await expect(screen.getByRole("heading", { level: 1 })).toContainText(/agent negotiates/i);
});

test("a visitor can hide a revealed password again", async ({ app, screen, browser }) => {
  await app.open("/auth/login");
  const password = screen.getByTestId("auth-login-password");
  const toggle = screen.getByTestId("auth-login-password-toggle");

  // TesterArmy forbids all attribute reads on secure locators. Read only the
  // input's type through trusted test code, never its password value.
  const inputType = () => browser.evaluate(() =>
    document.querySelector<HTMLInputElement>('[data-testid="auth-login-password"]')?.type || null
  );
  await expect(password).toBeVisible();
  await expect.poll(inputType).toBe("password");
  await toggle.click();
  await expect.poll(inputType).toBe("text");
  await expect(toggle).toHaveAccessibleName("Hide password");
  await toggle.click();
  await expect.poll(inputType).toBe("password");
  await expect(toggle).toHaveAccessibleName("Show password");
});

test("a French visitor recovers from a missing page into listings", async ({ app, screen, browser }) => {
  await app.open("/fr/testerarmy-missing-page");
  await expect(screen.getByRole("main")).toContainText("Cette page n'existe pas");
  await screen.getByRole("link", "Parcourir les annonces").click();

  await expect(browser).toHaveURL("/fr/browse");
  await expect(screen.getByTestId("browse-toolbar")).toBeVisible();
});
