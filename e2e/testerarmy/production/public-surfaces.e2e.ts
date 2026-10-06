import { expect } from "e2e";
import { APP_ORIGIN, MARKETING_ORIGIN, test } from "./public-fixtures";

test("production app root opens Connect and switches methods without generating a key", async ({ app, screen, browser }) => {
  await app.open("/");
  await expect(browser).toHaveURL(`${APP_ORIGIN}/start`);
  await expect(screen.getByRole("heading", "Connect your agent", { level: 1 })).toBeVisible();
  await expect(screen.getByTestId("connect-try-without-agent")).toHaveCount(0);
  await expect(browser.locator('a[href*="sandbox.clawdeals.com"]')).toHaveCount(0);
  await expect(screen.getByRole("navigation", "Progress")).toHaveText("CONNECT VERIFY GO");
  await expect(screen.getByTestId("connect-method-mcp")).toBeSelected();
  await expect(browser.locator("#connect-method-panel-mcp")).toBeVisible();
  await screen.getByTestId("connect-method-api").click();
  await expect(screen.getByTestId("connect-method-api")).toBeSelected();
  await expect(screen.getByTestId("connect-method-mcp")).not.toBeSelected();
  await expect(browser.locator("#connect-method-panel-api")).toBeVisible();
  await expect(browser.locator("#connect-method-panel-mcp")).toBeHidden();
  await screen.getByTestId("connect-method-mcp").click();
  await expect(screen.getByTestId("connect-method-mcp")).toBeSelected();
  await expect(browser.locator("#connect-method-panel-mcp")).toBeVisible();
  await expect(screen.getByTestId("connect-account-unlock")).toContainText("Without one, your key can only browse.");
  await expect(browser).toHaveURL(`${APP_ORIGIN}/start`);
});

test("production app header changes Connect to French and returns to canonical English", async ({ app, screen, browser }) => {
  await app.open("/start");
  await expect(browser).toHaveURL(`${APP_ORIGIN}/start`);
  await expect(screen.getByRole("heading", "Connect your agent", { level: 1 })).toBeVisible();
  const banner = screen.getByRole("banner");
  const mobile = await browser.evaluate(() => window.innerWidth < 640);
  await banner.getByRole("button", mobile ? "Settings" : "EN").click();
  await banner.getByRole("link", "FR").click();
  await expect(browser).toHaveURL(`${APP_ORIGIN}/fr/start`);
  await expect(screen.getByRole("heading", "Connecte ton agent", { level: 1 })).toBeVisible();
  await browser.reload();
  await expect(browser).toHaveURL(`${APP_ORIGIN}/fr/start`);
  await expect(screen.getByRole("heading", "Connecte ton agent", { level: 1 })).toBeVisible();
  await banner.getByRole("button", mobile ? "Paramètres" : "FR").click();
  await banner.getByRole("link", "EN").click();
  await expect(browser).toHaveURL(`${APP_ORIGIN}/start`);
  await expect(screen.getByRole("heading", "Connect your agent", { level: 1 })).toBeVisible();
});

test("production marketing homepage opens real public Browse through its CTA", async ({ app, screen, browser }) => {
  await app.open(`${MARKETING_ORIGIN}/`);
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/`);
  await expect(screen.getByTestId("hero-section")).toBeVisible();
  await expect(screen.getByTestId("hero-demo-link")).toHaveCount(0);
  await expect(browser.locator('a[href*="sandbox.clawdeals.com"]')).toHaveCount(0);
  await screen.getByTestId("hero-browse-cta").click();
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/browse`);
  await expect(screen.getByTestId("browse-toolbar")).toBeVisible();
  await expect(screen.getByTestId("browse-search")).toBeVisible();
  await expect(screen.getByTestId("browse-error")).toHaveCount(0);
});

test("production marketing language controls preserve their own canonical surface", async ({ app, screen, browser }) => {
  await app.open(`${MARKETING_ORIGIN}/`);
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/`);
  await expect(screen.getByTestId("hero-section")).toBeVisible();
  const nav = screen.getByRole("navigation");
  const mobile = await browser.evaluate(() => window.innerWidth < 640);
  if (mobile) await screen.getByTestId("navbar-mobile-settings-toggle").click();
  else await nav.getByRole("button", "EN").click();
  await nav.getByRole("link", "FR").click();
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/fr`);
  await expect(screen.getByRole("heading", { level: 1 })).toContainText("Ton agent négocie.");
  if (mobile) await screen.getByTestId("navbar-mobile-settings-toggle").click();
  else await nav.getByRole("button", "FR").click();
  await nav.getByRole("link", "EN").click();
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/`);
  await expect(screen.getByRole("heading", { level: 1 })).toContainText("Your agent negotiates.");
});

test("production app French missing page recovers through the main marketing Browse link", async ({ app, screen, browser }) => {
  await app.open("/fr/testerarmy-missing-page");
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/fr/testerarmy-missing-page`);
  const main = screen.getByRole("main");
  await expect(main.getByRole("heading", "404", { level: 1 })).toBeVisible();
  await expect(main).toContainText("Cette page n'existe pas ou a été déplacée.");
  const recovery = main.getByRole("link", "Parcourir les annonces");
  await expect(recovery).toHaveCount(1);
  await expect(recovery).toHaveAttribute("href", "/fr/browse");
  await recovery.click();
  await expect(browser).toHaveURL(`${MARKETING_ORIGIN}/fr/browse`);
  await expect(screen.getByTestId("browse-toolbar")).toBeVisible();
  await expect(screen.getByTestId("browse-search")).toBeVisible();
  await expect(screen.getByTestId("browse-error")).toHaveCount(0);
});
