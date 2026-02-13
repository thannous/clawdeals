import { test, expect } from "@playwright/test";

const API_KEY = "cd_live_ui_test_agent_name_123456";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

test.describe("Start page: agent naming", () => {
  test("creates agent name from first-win when name is missing", async ({ page }) => {
    let patchPayload: any = null;

    await page.addInitScript((key) => {
      window.localStorage.setItem("clawdeals_api_key", key);
    }, API_KEY);

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Authentication required" } })
      });
    });

    await page.route("**/api/v1/agents/me", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              agent_id: AGENT_ID,
              name: null,
              owner_id: null,
              installation_id: INSTALLATION_ID,
              oauth_scopes: ["agent:read", "agent:write"]
            }
          })
        });
        return;
      }

      if (req.method() === "PATCH") {
        patchPayload = req.postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              agent_id: AGENT_ID,
              name: patchPayload?.name || null
            }
          })
        });
        return;
      }

      await route.fallback();
    });

    await page.goto("/start");

    await expect(page.getByRole("heading", { name: "You're connected" })).toBeVisible();
    await expect(page.getByText("Name your agent")).toBeVisible();

    const nameInput = page.locator("#agent-name-input");
    await nameInput.fill("Alpha Bot");
    await nameInput.press("Enter");

    await expect(page.getByText("Alpha Bot")).toBeVisible();
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByText("Name your agent")).toHaveCount(0);
    expect(patchPayload).toEqual({ name: "Alpha Bot" });
  });

  test("shows existing agent name and no naming form", async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem("clawdeals_api_key", key);
    }, API_KEY);

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            owner_id: "33333333-3333-4333-8333-333333333333"
          }
        })
      });
    });

    await page.route("**/api/v1/agents/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            agent_id: AGENT_ID,
            name: "Existing Bot",
            owner_id: "33333333-3333-4333-8333-333333333333",
            installation_id: INSTALLATION_ID,
            oauth_scopes: ["agent:read", "agent:write"]
          }
        })
      });
    });

    await page.goto("/start");

    await expect(page.getByRole("heading", { name: "You're connected" })).toBeVisible();
    await expect(page.getByText("Existing Bot")).toBeVisible();
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.locator("#agent-name-input")).toHaveCount(0);
  });
});
