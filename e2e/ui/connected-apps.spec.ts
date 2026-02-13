import { test, expect } from "@playwright/test";

test.describe("Settings: Connected Apps", () => {
  test("renders list and revokes an installation", async ({ page }) => {
    const installationId = "11111111-1111-4111-8111-111111111111";

    let installations: any[] = [
      {
        installation_id: installationId,
        agent_id: "22222222-2222-4222-8222-222222222222",
        client_type: "openclaw",
        client_version: "1.2.3",
        oauth_scopes: ["watchlists:read", "watchlists:write", "listings:read", "listings:write"],
        status: "ACTIVE",
        created_at: "2026-02-10T12:00:00Z",
        last_seen_at: "2026-02-10T12:30:00Z",
      },
    ];

    await page.route("**/api/v1/owner/installations**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ installations }),
      });
    });

    await page.route("**/api/v1/installations/*:revoke", async (route) => {
      const headers = route.request().headers();
      expect(headers["idempotency-key"]).toBeTruthy();

      installations = installations.map((it) =>
        it.installation_id === installationId ? { ...it, status: "REVOKED" } : it
      );

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          installation_id: installationId,
          status: "REVOKED",
          revoked_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/settings/connected-apps");

    await expect(page.getByTestId("connected-apps-page")).toBeVisible();
    await expect(page.getByTestId("connected-apps-table")).toBeVisible();
    await expect(page.getByText("watchlists:read")).toBeVisible();

    const revokeButton = page.getByTestId(`connected-apps-revoke-${installationId}`);
    await expect(revokeButton).toBeVisible();
    await revokeButton.click();

    await expect(page.getByTestId("confirm-modal")).toBeVisible();
    await page.getByTestId("connected-apps-revoke-reason").fill("suspected abuse");
    await page.getByTestId("confirm-modal").getByRole("button", { name: "Revoke" }).click();

    await expect(page.getByText("Installation revoked")).toBeVisible();
    await expect(page.getByTestId("confirm-modal")).toHaveCount(0);
    await expect(page.locator(`[data-testid="connected-apps-revoke-${installationId}"]`)).toHaveCount(0);
    await expect(page.getByTestId("connected-apps-table").getByText("REVOKED")).toBeVisible();
  });

  test("rotates installation credential with optional grace seconds and clears reveal on close", async ({ page }) => {
    const installationId = "33333333-3333-4333-8333-333333333333";
    const newCredential = "cd_live_rotate.new-secret";

    const installations: any[] = [
      {
        installation_id: installationId,
        agent_id: "44444444-4444-4444-8444-444444444444",
        client_type: "openclaw",
        client_version: "2.0.0",
        oauth_scopes: ["watchlists:read", "listings:read"],
        status: "ACTIVE",
        created_at: "2026-02-10T12:00:00Z",
        last_seen_at: "2026-02-10T12:30:00Z",
      },
    ];

    await page.route("**/api/v1/owner/installations**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ installations }),
      });
    });

    await page.route("**/api/v1/installations/*:rotate", async (route) => {
      const headers = route.request().headers();
      expect(headers["idempotency-key"]).toBeTruthy();
      expect(route.request().postDataJSON()).toEqual({ grace_seconds: 120 });

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          installation_id: installationId,
          api_key_id: "55555555-5555-4555-8555-555555555555",
          api_key: newCredential,
          rotated_at: "2026-02-10T13:00:00Z",
          previous_api_key_id: "66666666-6666-4666-8666-666666666666",
          grace_seconds: 120,
        }),
      });
    });

    await page.goto("/settings/connected-apps");

    const rotateButton = page.getByTestId(`connected-apps-rotate-${installationId}`);
    await expect(rotateButton).toBeVisible();
    await rotateButton.click();

    await expect(page.getByTestId("confirm-modal")).toBeVisible();
    await page.getByTestId("connected-apps-rotate-grace-seconds").fill("120");
    await page.getByTestId("confirm-modal").getByRole("button", { name: "Rotate" }).click();

    await expect(page.getByText("Credential rotated. Copy it now.")).toBeVisible();
    await expect(page.getByTestId("connected-apps-rotate-credential")).toHaveValue(newCredential);

    await page.getByTestId("confirm-modal").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByTestId("confirm-modal")).toHaveCount(0);
    await expect(page.getByTestId("connected-apps-rotate-credential")).toHaveCount(0);
  });

  test("redirects to login when owner session is missing", async ({ page }) => {
    await page.route("**/api/v1/owner/installations**", async (route) => {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Owner authentication required" } }),
      });
    });

    await page.goto("/settings/connected-apps");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  });

  test("redirects to login when revoke returns 401 after page load", async ({ page }) => {
    const installationId = "77777777-7777-4777-8777-777777777777";

    await page.route("**/api/v1/owner/installations**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          installations: [
            {
              installation_id: installationId,
              agent_id: "88888888-8888-4888-8888-888888888888",
              client_type: "openclaw",
              client_version: "2.0.0",
              oauth_scopes: ["watchlists:read"],
              status: "ACTIVE",
              created_at: "2026-02-10T12:00:00Z",
              last_seen_at: "2026-02-10T12:30:00Z"
            }
          ]
        })
      });
    });

    await page.route("**/api/v1/installations/*:revoke", async (route) => {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Owner authentication required" } })
      });
    });

    await page.goto("/settings/connected-apps");

    await page.getByTestId(`connected-apps-revoke-${installationId}`).click();
    await page.getByTestId("confirm-modal").getByRole("button", { name: "Revoke" }).click();

    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  });
});
