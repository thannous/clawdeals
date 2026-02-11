import { test, expect } from "@playwright/test";

const mockChannels = [
  {
    identity_id: "44444444-4444-4444-8444-444444444444",
    channel_type: "telegram",
    display_name: "@claw",
    role: "owner",
    state: "ACTIVE",
    created_at: "2026-02-10T12:00:00Z"
  }
];

test.describe("Settings: Linked Identities", () => {
  test("renders identities and unlinks one", async ({ page }) => {
    let channels = [...mockChannels];

    await page.route("**/api/v1/owner/identities/*", async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();

      const headers = route.request().headers();
      expect(headers["x-owner-id"]).toBeFalsy();
      expect(headers["idempotency-key"]).toBeTruthy();

      const id = route.request().url().split("/").pop();
      channels = channels.map((row) =>
        row.identity_id === id ? { ...row, state: "REVOKED", revoked_at: "2026-02-11T12:00:00Z" } : row
      );

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: channels.find((row) => row.identity_id === id) })
      });
    });

    await page.route("**/api/v1/owner/identities**", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            owner_id: "11111111-1111-4111-8111-111111111111",
            email_masked: "o***@example.com",
            email_verified_at: "2026-02-10T12:00:00Z",
            channels
          }
        })
      });
    });

    await page.goto("/settings/identities");

    await expect(page.getByTestId("identities-page")).toBeVisible();
    await expect(page.getByTestId("identities-email")).toBeVisible();
    await expect(page.getByTestId("identities-table")).toBeVisible();

    const unlink = page.getByTestId(`identities-unlink-${mockChannels[0].identity_id}`);
    await expect(unlink).toBeVisible();
    await unlink.click();

    await expect(page.getByTestId("confirm-modal")).toBeVisible();
    await page.getByTestId("confirm-modal").getByRole("button", { name: "Unlink" }).click();

    await expect(page.getByTestId("identities-table").getByText("REVOKED")).toBeVisible();
  });
});
