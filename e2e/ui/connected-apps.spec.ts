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
        status: "ACTIVE",
        created_at: "2026-02-10T12:00:00Z",
        last_seen_at: "2026-02-10T12:30:00Z",
      },
    ];

    await page.route("**/api/console/owner/installations**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ installations }),
      });
    });

    await page.route("**/api/console/installations/*:revoke", async (route) => {
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
});
