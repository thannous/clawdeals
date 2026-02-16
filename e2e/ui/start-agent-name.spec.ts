import { test, expect } from "@playwright/test";

const API_KEY = "cd_live_ui_test_agent_name_123456";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

test.describe("Start page: agent naming", () => {
  test("auto-claims agent when owner session appears", async ({ page }) => {
    let claimCalled = false;
    let meReadCount = 0;

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

    await page.route("**/api/v1/agents/me/claim", async (route) => {
      claimCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            agent_id: AGENT_ID,
            owner_id: "33333333-3333-4333-8333-333333333333",
            name: "chacha",
            claimed: true
          }
        })
      });
    });

    await page.route("**/api/v1/agents/me", async (route) => {
      const req = route.request();
      if (req.method() !== "GET") {
        return route.fallback();
      }
      meReadCount += 1;
      const ownerId = meReadCount > 1 ? "33333333-3333-4333-8333-333333333333" : "99999999-9999-4999-8999-999999999999";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            agent_id: AGENT_ID,
            name: "chacha",
            owner_id: ownerId,
            installation_id: INSTALLATION_ID,
            oauth_scopes: ["agent:read", "agent:write"]
          }
        })
      });
    });

    await page.goto("/start");

    await expect(page.getByRole("heading", { name: "You're connected" })).toBeVisible();
    await expect.poll(() => claimCalled).toBe(true);
    await expect(page.getByText("chacha")).toBeVisible();
    await expect(page.getByText("Link to your account")).toHaveCount(0);
  });

  test("claims after login session appears later", async ({ page }) => {
    let claimCalled = false;
    let authProbeCount = 0;

    await page.route("**/api/v1/auth/me", async (route) => {
      authProbeCount += 1;
      const isAuthenticated = authProbeCount >= 2;
      if (!isAuthenticated) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Owner authentication required" } })
        });
        return;
      }

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

    await page.route("**/api/v1/deals?limit=1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { deals: [] } })
      });
    });

    await page.route("**/api/v1/agents/me/claim", async (route) => {
      claimCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            agent_id: AGENT_ID,
            owner_id: "33333333-3333-4333-8333-333333333333",
            name: "chacha",
            claimed: true
          }
        })
      });
    });

    await page.route("**/api/v1/agents/me", async (route) => {
      const req = route.request();
      if (req.method() !== "GET") {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            agent_id: AGENT_ID,
            name: "chacha",
            owner_id: claimCalled ? "33333333-3333-4333-8333-333333333333" : "99999999-9999-4999-8999-999999999999",
            installation_id: INSTALLATION_ID,
            oauth_scopes: ["agent:read", "agent:write"]
          }
        })
      });
    });

    await page.goto("/start");

    await page.getByRole("button", { name: "I have a key" }).first().click();
    await page.locator("#connect-paste-key").fill(API_KEY);
    await page.getByTestId("validate-key").click();

    await expect(page.getByRole("heading", { name: "You're connected" })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await expect.poll(() => claimCalled).toBe(true);
    await expect(page.getByText("chacha")).toBeVisible();
  });

  test("creates agent name from first-win when name is missing", async ({ page }) => {
    let patchPayload: any = null;

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

    await page.route("**/api/v1/agents/me/claim", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "AGENT_ALREADY_CLAIMED",
            message: "already claimed"
          }
        })
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
    const nameInput = page.locator("#agent-name-input");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Alpha Bot");
    await nameInput.press("Enter");

    await expect(page.getByText("Alpha Bot")).toBeVisible();
    await expect(nameInput).toHaveCount(0);
    expect(patchPayload).toEqual({ name: "Alpha Bot" });
  });

  test("updates generic default name from first-win", async ({ page }) => {
    let patchPayload: any = null;

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

    await page.route("**/api/v1/agents/me/claim", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "AGENT_ALREADY_CLAIMED",
            message: "already claimed"
          }
        })
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
              name: "New Agent",
              owner_id: "99999999-9999-4999-8999-999999999999",
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
    const nameInput = page.locator("#agent-name-input");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Chachat");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Chachat")).toBeVisible();
    await expect(nameInput).toHaveCount(0);
    expect(patchPayload).toEqual({ name: "Chachat" });
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
    await expect(page.locator("#agent-name-input")).toHaveCount(0);
  });
});
