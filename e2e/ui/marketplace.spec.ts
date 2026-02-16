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

  test("country chips are visible with Worldwide selected by default", async ({ page }) => {
    await page.goto("/marketplace");

    const worldwide = page.getByTestId("country-chip-worldwide");
    await expect(worldwide).toBeVisible();

    // Worldwide chip should have the active style (bg-text)
    await expect(worldwide).toHaveClass(/bg-text/);

    // Popular country chips should be visible
    await expect(page.getByTestId("country-chip-FR")).toBeVisible();
    await expect(page.getByTestId("country-chip-US")).toBeVisible();
    await expect(page.getByTestId("country-chip-GB")).toBeVisible();
  });

  test("clicking a country chip updates card links with ?country=", async ({ page }) => {
    await page.goto("/marketplace");

    // Click FR chip
    await page.getByTestId("country-chip-FR").click();

    // FR chip should be active
    await expect(page.getByTestId("country-chip-FR")).toHaveClass(/bg-text/);
    // Worldwide should no longer be active
    await expect(page.getByTestId("country-chip-worldwide")).not.toHaveClass(/bg-text/);

    // Card links should include country param
    const listingsHref = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(listingsHref).toContain("country=FR");

    const dealsHref = await page.getByTestId("marketplace-card-deals").getAttribute("href");
    expect(dealsHref).toContain("country=FR");
  });

  test("clicking Worldwide removes ?country= from links", async ({ page }) => {
    await page.goto("/marketplace");

    // Select FR first
    await page.getByTestId("country-chip-FR").click();
    let href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).toContain("country=FR");

    // Click Worldwide
    await page.getByTestId("country-chip-worldwide").click();
    href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).not.toContain("country=");
  });

  test("country selection persists in localStorage", async ({ page }) => {
    await page.goto("/marketplace");

    // Select DE
    await page.getByTestId("country-chip-DE").click();

    const stored = await page.evaluate(() => localStorage.getItem("clawdeals:country"));
    expect(stored).toBe("DE");

    // Reload and check it's still selected
    await page.reload();
    await expect(page.getByTestId("country-chip-DE")).toHaveClass(/bg-text/);

    const href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).toContain("country=DE");
  });

  test("More dropdown opens with search and allows country selection", async ({ page }) => {
    await page.goto("/marketplace");

    await page.getByTestId("country-more-btn").click();
    await expect(page.getByTestId("country-search")).toBeVisible();

    // Search for Belgium
    await page.getByTestId("country-search").fill("Belg");
    await expect(page.getByTestId("country-option-BE")).toBeVisible();

    // Select Belgium from dropdown
    await page.getByTestId("country-option-BE").click();

    // Dropdown should close
    await expect(page.getByTestId("country-search")).not.toBeVisible();

    // Links should have country=BE
    const href = await page.getByTestId("marketplace-card-listings").getAttribute("href");
    expect(href).toContain("country=BE");
  });

  test("locale switch to FR shows French translations", async ({ page }) => {
    await page.goto("/marketplace");

    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: /^EN$/i }).click();
    await nav.getByRole("link", { name: "FR", exact: true }).click();

    await expect(page).toHaveURL(/\/fr\/marketplace/);
    await expect(page.getByTestId("marketplace-heading")).toHaveText(/MARKETPLACE/i);

    // Country label should be in French
    await expect(page.getByText("Pays")).toBeVisible();
    await expect(page.getByTestId("country-chip-worldwide")).toContainText(/monde entier/i);
  });
});
