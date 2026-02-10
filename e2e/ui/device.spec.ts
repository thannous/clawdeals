import { test, expect } from "@playwright/test";

const USER_CODE = "ABCD-EFGH";
const AUTH_ID = "11111111-1111-1111-1111-111111111111";

function buildPendingView() {
  return {
    authorization_id: AUTH_ID,
    status: "PENDING",
    client_id: "openclaw",
    requested_scopes: ["agent:read", "agent:write"],
    requested_agent_name: "OpenClaw",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    owner_id: null,
    agent_id: null,
    authorized_at: null,
    denied_at: null
  };
}

test.describe("Device page", () => {
  test("rejects invalid user code format", async ({ page }) => {
    await page.goto("/device");

    await page.getByTestId("device-user-code").fill("not-a-code");
    await page.getByTestId("device-lookup").click();

    await expect(page.getByTestId("device-error")).toContainText("Invalid code format");
  });

  test("auto-loads from query param and approves via console wrapper", async ({ page }) => {
    let approveCalled = false;

    await page.route("**/api/oauth/device/requests**", async (route) => {
      const url = new URL(route.request().url());
      const userCode = url.searchParams.get("user_code");
      if (userCode !== USER_CODE) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: buildPendingView() })
      });
    });

    await page.route("**/api/console/oauth/device/approve", async (route) => {
      approveCalled = true;
      const headers = route.request().headers();
      expect(headers["idempotency-key"]).toBeTruthy();

      const body = route.request().postDataJSON();
      expect(body?.user_code).toBe(USER_CODE);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            authorization_id: AUTH_ID,
            status: "AUTHORIZED",
            owner_id: "00000000-0000-4000-a000-000000000123",
            agent_id: "22222222-2222-2222-2222-222222222222",
            authorized_at: new Date().toISOString()
          }
        })
      });
    });

    await page.goto(`/device?user_code=${encodeURIComponent(USER_CODE)}`);

    await expect(page.getByTestId("device-page")).toBeVisible();
    await expect(page.getByTestId("device-loaded")).toBeVisible();
    await expect(page.getByTestId("device-status")).toHaveText("PENDING");
    await expect(page.getByText("agent:read")).toBeVisible();

    await page.getByTestId("device-approve").click();

    await expect(page.getByTestId("device-status")).toHaveText("AUTHORIZED");
    await expect(page.getByText("Success")).toBeVisible();
    expect(approveCalled).toBe(true);
  });

  test("manual lookup normalizes user code and denies after confirmation", async ({ page }) => {
    let denyCalled = false;

    await page.route("**/api/oauth/device/requests**", async (route) => {
      const url = new URL(route.request().url());
      const userCode = url.searchParams.get("user_code");
      if (userCode !== USER_CODE) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: buildPendingView() })
      });
    });

    await page.route("**/api/console/oauth/device/deny", async (route) => {
      denyCalled = true;
      const headers = route.request().headers();
      expect(headers["idempotency-key"]).toBeTruthy();

      const body = route.request().postDataJSON();
      expect(body?.user_code).toBe(USER_CODE);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            authorization_id: AUTH_ID,
            status: "DENIED",
            denied_at: new Date().toISOString()
          }
        })
      });
    });

    await page.goto("/device");

    // Intentionally enter a non-canonical format to verify normalization.
    await page.getByTestId("device-user-code").fill("abcd efgh");
    await page.getByTestId("device-lookup").click();

    await expect(page.getByTestId("device-user-code")).toHaveValue(USER_CODE);
    await expect(page.getByTestId("device-loaded")).toBeVisible();
    await expect(page.getByTestId("device-status")).toHaveText("PENDING");

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.getByTestId("device-deny").click();

    await expect(page.getByTestId("device-status")).toHaveText("DENIED");
    await expect(page.getByText("Success")).toBeVisible();
    expect(denyCalled).toBe(true);
  });
});
