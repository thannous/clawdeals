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
  });

  test("switches locale FR then EN from the navbar", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation");

    await nav.getByRole("link", { name: "FR", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/fr"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CONNECTE\s*TON\s*AGENT\s*IA/i);

    await nav.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/$"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CONNECT\s*YOUR\s*AI\s*AGENT/i);
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
