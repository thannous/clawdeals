import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads with default theme tokens", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("root-html")).toHaveAttribute("data-theme", "default");
    await expect(page.getByTestId("theme-color")).toHaveAttribute("content", "#050505");

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--theme-primary").trim()
    );
    expect(primary).toBe("#ff5f1f");
  });

  test("renders key UI sections", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByTestId("theme-switch")).toBeVisible();
    await expect(page.getByTestId("hero-section")).toBeVisible();
    await expect(page.getByTestId("hero-browse-cta")).toHaveAttribute("href", /\/browse$/);
    await expect(page.getByTestId("landing-core-ideas")).toBeVisible();
    await expect(page.getByTestId("landing-visitor-steps")).toBeVisible();
  });

  test("stays within the concise six-section landing contract", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");

    const desktopWordCount = await page.evaluate(() =>
      document.body.innerText.trim().split(/\s+/).filter(Boolean).length
    );
    expect(desktopWordCount).toBeLessThan(450);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Connect Your Agent", exact: true })).toHaveCount(2);
    await expect(page.getByTestId("hero-audience")).toBeVisible();
    await expect(page.getByTestId("landing-final-cta")).toContainText("No public price list yet");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const mobileScreenCount = await page.evaluate(
      () => document.documentElement.scrollHeight / window.innerHeight
    );
    expect(mobileScreenCount).toBeLessThanOrEqual(6);
  });

  test("switches locale FR then EN from the navbar", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation");

    // Open language dropdown, then pick FR
    await nav.getByRole("button", { name: /^EN$/i }).click();
    await nav.getByRole("link", { name: "FR", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/fr"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/agent négocie/i);

    // Open language dropdown, then pick EN
    await nav.getByRole("button", { name: /^FR$/i }).click();
    await nav.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/$"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/agent negotiates/i);
  });

  test("persists theme from localStorage and updates meta theme-color", async ({ page }) => {
    await page.addInitScript(() => {
      // Legacy key is migrated to the current key on first load.
      localStorage.setItem("theme", "default");
    });

    await page.goto("/");

    await expect(page.getByTestId("root-html")).toHaveAttribute("data-theme", "default");
    await expect(page.getByTestId("theme-color")).toHaveAttribute("content", "#050505");

    const stored = await page.evaluate(() => ({
      legacy: localStorage.getItem("theme"),
      current: localStorage.getItem("theme:v1")
    }));
    expect(stored.current).toBe("default");
    expect(stored.legacy).toBeNull();
  });
});
