import { test, expect } from "@playwright/test";

test.describe("Marketplace hub", () => {
  test("renders page heading and both section cards", async ({ page }) => {
    await page.goto("/marketplace");

    await expect(page.getByTestId("marketplace-heading")).toBeVisible();
    await expect(page.getByTestId("marketplace-heading")).toHaveText(/MARKETPLACE/i);
    await expect(page.getByTestId("marketplace-card-listings")).toBeVisible();
    await expect(page.getByTestId("marketplace-card-deals")).toBeVisible();
  });

  test("listings card links to /browse", async ({ page }) => {
    await page.goto("/marketplace");

    const link = page.getByTestId("marketplace-card-listings");
    await expect(link).toHaveAttribute("href", /\/browse/);
  });

  test("deals card links to deals page", async ({ page }) => {
    await page.goto("/marketplace");

    const link = page.getByTestId("marketplace-card-deals");
    await expect(link).toHaveAttribute("href", /\/deals/);
  });

  test("shows only the supported markets with All selected by default", async ({ page }) => {
    await page.goto("/marketplace");

    const allMarkets = page.getByTestId("country-chip-all");
    await expect(allMarkets).toBeVisible();
    await expect(allMarkets).toHaveClass(/bg-text/);

    await expect(page.getByTestId("country-chip-FR")).toContainText("FR · EUR");
    await expect(page.getByTestId("country-chip-GB")).toContainText("GB · GBP");
    await expect(page.getByTestId("country-chip-ES")).toContainText("ES · EUR");

    await expect(page.getByTestId("country-chip-US")).toHaveCount(0);
    await expect(page.getByTestId("country-chip-DE")).toHaveCount(0);
    await expect(page.getByTestId("country-chip-BE")).toHaveCount(0);
    await expect(page.getByTestId("country-more-btn")).toHaveCount(0);
  });

  test("clicking a country chip updates card links with ?country=", async ({ page }) => {
    await page.goto("/marketplace");

    // Click FR chip
    await page.getByTestId("country-chip-FR").click();

    // FR chip should be active
    await expect(page.getByTestId("country-chip-FR")).toHaveClass(/bg-text/);
    // All markets should no longer be active
    await expect(page.getByTestId("country-chip-all")).not.toHaveClass(/bg-text/);

    // Card links should include country param
    const listingsHref = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(listingsHref).toContain("country=FR");

    const dealsHref = await page.getByTestId("marketplace-card-deals").getAttribute("href");
    expect(dealsHref).toContain("country=FR");
  });

  test("clicking All removes ?country= from links", async ({ page }) => {
    await page.goto("/marketplace");

    // Select FR first
    await page.getByTestId("country-chip-FR").click();
    let href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).toContain("country=FR");

    // Click All
    await page.getByTestId("country-chip-all").click();
    href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).not.toContain("country=");
  });

  test("country selection persists in localStorage", async ({ page }) => {
    await page.goto("/marketplace");

    // Select ES
    await page.getByTestId("country-chip-ES").click();

    const stored = await page.evaluate(() => localStorage.getItem("clawdeals:country"));
    expect(stored).toBe("ES");

    // Reload and check it's still selected
    await page.reload();
    await expect(page.getByTestId("country-chip-ES")).toHaveClass(/bg-text/);

    const href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).toContain("country=ES");
  });

  test("drops a persisted unsupported market", async ({ page }) => {
    await page.goto("/marketplace");
    await page.evaluate(() => localStorage.setItem("clawdeals:country", "US"));
    await page.reload();

    await expect(page.getByTestId("country-chip-all")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clawdeals:country"))).toBeNull();
    await expect(page.getByTestId("marketplace-card-listings")).toHaveAttribute("href", "/browse");
  });

  test("locale switch to FR shows French translations", async ({ page }) => {
    await page.goto("/marketplace");

    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: /^EN$/i }).click();
    await nav.getByRole("link", { name: "FR", exact: true }).click();

    await expect(page).toHaveURL(/\/fr\/marketplace/);
    await expect(page.getByTestId("marketplace-heading")).toHaveText(/MARKETPLACE/i);

    // Country label should be in French
    await expect(page.getByText("Pays", { exact: true })).toBeVisible();
    await expect(page.getByTestId("country-chip-all")).toContainText(/^Tous$/i);
  });
});
