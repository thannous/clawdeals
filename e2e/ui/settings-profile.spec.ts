import { test, expect } from "@playwright/test";

const MOCK_OWNER_ID = "11111111-1111-4111-a111-111111111111";

function mockAuthMe(page: any) {
  return page.route("**/api/v1/auth/me**", async (route: any) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { owner_id: MOCK_OWNER_ID } }),
    });
  });
}

function mockOwnerGet(page: any, overrides: Record<string, unknown> = {}) {
  return page.route("**/api/v1/owner/**", async (route: any, request: any) => {
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            owner_id: MOCK_OWNER_ID,
            email_verified_at: null,
            display_name: null,
            bio: null,
            avatar_url: "/avatars/default-1.svg",
            city: null,
            state_region: null,
            country: null,
            show_email: false,
            available: true,
            ...overrides,
          },
        }),
      });
    }
    // PATCH
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          owner_id: MOCK_OWNER_ID,
          email_verified_at: null,
          display_name: "Saved Name",
          bio: null,
          avatar_url: "/avatars/default-1.svg",
          city: null,
          state_region: null,
          country: null,
          show_email: false,
          available: true,
          ...overrides,
        },
      }),
    });
  });
}

test.describe("Settings: Profile", () => {
  test("redirects to login when auth is missing", async ({ page }) => {
    await page.route("**/api/v1/auth/me**", async (route) => {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Owner authentication required" } }),
      });
    });

    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  });

  test("renders profile page with empty profile", async ({ page }) => {
    await mockAuthMe(page);
    await mockOwnerGet(page);

    await page.goto("/settings/profile");
    await expect(page.locator("[data-testid='profile-page']")).toBeVisible();

    // Completion banner should be visible (nothing filled in)
    await expect(page.locator("text=complete your profile")).toBeVisible();
  });

  test("renders profile page with filled profile and hides completion banner", async ({ page }) => {
    await mockAuthMe(page);
    await mockOwnerGet(page, {
      display_name: "John Doe",
      city: "Paris",
      email_verified_at: "2026-01-01T00:00:00Z",
    });

    await page.goto("/settings/profile");
    await expect(page.locator("[data-testid='profile-page']")).toBeVisible();

    // Completion banner should NOT be visible (all complete)
    await expect(page.locator("text=complete your profile")).not.toBeVisible();
  });

  test("shows verify CTA when email not verified", async ({ page }) => {
    await mockAuthMe(page);
    await mockOwnerGet(page, { email_verified_at: null });

    await page.goto("/settings/profile");
    // The verify banner should be visible
    await expect(page.locator("text=get verified")).toBeVisible();
  });

  test("hides verify CTA when email is verified", async ({ page }) => {
    await mockAuthMe(page);
    await mockOwnerGet(page, {
      display_name: "Verified",
      city: "Paris",
      email_verified_at: "2026-01-01T00:00:00Z",
    });

    await page.goto("/settings/profile");
    await expect(page.locator("text=get verified")).not.toBeVisible();
  });

  test("can fill in display name and save", async ({ page }) => {
    await mockAuthMe(page);
    await mockOwnerGet(page);

    let patchCalled = false;
    let patchBody: any = null;

    // Intercept PATCH calls
    await page.route("**/api/v1/owner/**", async (route, request) => {
      if (request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              owner_id: MOCK_OWNER_ID,
              email_verified_at: null,
              display_name: null,
              bio: null,
              avatar_url: "/avatars/default-1.svg",
              city: null,
              state_region: null,
              country: null,
              show_email: false,
              available: true,
            },
          }),
        });
      }
      // PATCH
      patchCalled = true;
      patchBody = request.postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            owner_id: MOCK_OWNER_ID,
            email_verified_at: null,
            display_name: patchBody?.display_name || null,
            bio: null,
            avatar_url: "/avatars/default-1.svg",
            city: null,
            state_region: null,
            country: null,
            show_email: false,
            available: true,
          },
        }),
      });
    });

    await page.goto("/settings/profile");
    await expect(page.locator("[data-testid='profile-page']")).toBeVisible();

    // Fill display name
    const nameInput = page.locator("input[type='text']").first();
    await nameInput.fill("My Display Name");

    // Click save
    await page.locator("button", { hasText: /save/i }).click();

    // Verify PATCH was called
    expect(patchCalled).toBe(true);
    expect(patchBody.display_name).toBe("My Display Name");
  });

  test("avatar preset selection updates the displayed avatar", async ({ page }) => {
    await mockAuthMe(page);
    await mockOwnerGet(page);

    await page.goto("/settings/profile");
    await expect(page.locator("[data-testid='profile-page']")).toBeVisible();

    // The main avatar should show default-1
    const mainAvatar = page.locator("img[alt='avatar']");
    await expect(mainAvatar).toHaveAttribute("src", "/avatars/default-1.svg");

    // Click the third preset avatar
    const presetButtons = page.locator("button img[src='/avatars/default-3.svg']");
    await presetButtons.click();

    // Main avatar should now show default-3
    await expect(mainAvatar).toHaveAttribute("src", "/avatars/default-3.svg");
  });
});
