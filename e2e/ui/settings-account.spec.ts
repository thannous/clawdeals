import { test, expect } from "@playwright/test";

test.describe("Settings: Account", () => {
  test("redirects to login when owner session is missing", async ({ page }) => {
    await page.route("**/api/v1/auth/me**", async (route) => {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Owner authentication required" } })
      });
    });

    await page.route("**/api/v1/owner/agents**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { agents: [] } })
      });
    });

    await page.route("**/api/v1/owner/claims**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { claims: [] } })
      });
    });

    await page.route("**/api/v1/owner/activity**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { activities: [] } })
      });
    });

    await page.goto("/settings/account");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  });
});
