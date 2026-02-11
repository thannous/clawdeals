import { test, expect } from "@playwright/test";

test.describe("Auth: Login", () => {
  test("requests magic link and shows verify link", async ({ page }) => {
    let loginStarted = false;

    await page.route("**/api/v1/auth/login:start", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toMatchObject({ email: "owner@example.com" });
      loginStarted = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            owner_id: "11111111-1111-4111-8111-111111111111",
            session_id: "22222222-2222-4222-8222-222222222222",
            session_token: "cd_os_test_123",
            expires_at: "2026-02-12T12:00:00Z"
          }
        })
      });
    });

    await page.goto("/auth/login");
    await expect(page.getByTestId("auth-login-page")).toBeVisible();

    await page.getByTestId("auth-login-email").fill("owner@example.com");
    await page.getByTestId("auth-login-submit").click();

    await expect(page.getByTestId("auth-login-sent")).toBeVisible();
    await expect(page.getByTestId("auth-login-token")).toContainText("cd_os_test_123");
    await expect(page.getByTestId("auth-login-verify-link")).toHaveAttribute(
      "href",
      "/auth/verify?session_id=22222222-2222-4222-8222-222222222222&token=cd_os_test_123"
    );
    expect(loginStarted).toBe(true);
  });
});
