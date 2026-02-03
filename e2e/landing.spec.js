const { test, expect } = require("@playwright/test");

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
    await expect(page.getByRole("button", { name: /AGENTS \/\//i })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("switches locale FR then EN from the navbar", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "FR" }).click();
    await expect(page).toHaveURL(/\/fr/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("DÉPLOIEMENT");

    await page.getByRole("link", { name: "EN" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("TACTICAL");
  });

  test("persists theme from localStorage and updates meta theme-color", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme", "default");
    });

    await page.goto("/");

    await expect(page.getByTestId("root-html")).toHaveAttribute("data-theme", "default");
    await expect(page.getByTestId("theme-color")).toHaveAttribute("content", "#050505");

    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("default");
  });
});
