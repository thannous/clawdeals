import { test, expect } from "@playwright/test";

const CLAIM_TOKEN = "cd_claim_test";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "00000000-0000-4000-a000-000000000123";
const EXISTING_AGENT_ID = "22222222-2222-4222-8222-222222222222";

function buildPendingView(overrides: Record<string, any> = {}) {
  return {
    session_id: SESSION_ID,
    status: "PENDING_CLAIM",
    requested_agent_name: "OpenClaw",
    requested_scopes: ["agent:read", "agent:write"],
    client_type: "openclaw",
    client_version: "1.0.0",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    claimed_at: null,
    ...overrides
  };
}

test.describe("Claim page", () => {
  test("defaults to attach mode and hides create when owner reached limit", async ({ page }) => {
    let claimCalled = false;

    await page.route("**/api/v1/connect/claims/**", async (route) => {
      const token = decodeURIComponent(route.request().url().split("/").pop() || "");
      expect(token).toBe(CLAIM_TOKEN);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: buildPendingView({
            owner_context_available: true,
            owner_agent_limit: 1,
            owner_agents: [{ agent_id: EXISTING_AGENT_ID, name: "Existing Agent", status: "active" }],
            allow_create_agent: false,
            default_mode: "attach_agent"
          })
        })
      });
    });

    await page.route(`**/api/v1/connect/sessions/${SESSION_ID}/claim`, async (route) => {
      claimCalled = true;
      const body = route.request().postDataJSON();
      expect(body?.mode).toBe("attach_agent");
      expect(body?.attach_agent_id).toBe(EXISTING_AGENT_ID);
      expect(body?.claim_token).toBe(CLAIM_TOKEN);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            session_id: SESSION_ID,
            status: "CLAIMED",
            owner_id: OWNER_ID,
            agent_id: EXISTING_AGENT_ID,
            claimed_at: new Date().toISOString()
          }
        })
      });
    });

    await page.goto(`/claim/${encodeURIComponent(CLAIM_TOKEN)}`);

    await expect(page.getByTestId("claim-page")).toBeVisible();
    await expect(page.getByTestId("claim-loaded")).toBeVisible();
    await expect(page.getByTestId("claim-mode-create")).toHaveCount(0);
    await expect(page.getByTestId("claim-mode-attach")).toBeVisible();
    await expect(page.getByTestId("claim-attach-agent-select")).toHaveValue(EXISTING_AGENT_ID);
    await expect(page.getByText("Read listings, offers, and account state for this installation.")).toBeVisible();

    await page.getByTestId("claim-approve").click();

    await expect(page.getByTestId("claim-status")).toContainText("CLAIMED");
    expect(claimCalled).toBe(true);
  });

  test("defaults to create mode when owner has no agent", async ({ page }) => {
    let claimCalled = false;

    await page.route("**/api/v1/connect/claims/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: buildPendingView({
            owner_context_available: true,
            owner_agent_limit: 1,
            owner_agents: [],
            allow_create_agent: true,
            default_mode: "create_agent"
          })
        })
      });
    });

    await page.route(`**/api/v1/connect/sessions/${SESSION_ID}/claim`, async (route) => {
      claimCalled = true;
      const body = route.request().postDataJSON();
      expect(body?.mode).toBe("create_agent");
      expect(body?.agent_name).toBe("UI Created Agent");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            session_id: SESSION_ID,
            status: "CLAIMED",
            owner_id: OWNER_ID,
            agent_id: "33333333-3333-4333-8333-333333333333",
            claimed_at: new Date().toISOString()
          }
        })
      });
    });

    await page.goto(`/claim/${encodeURIComponent(CLAIM_TOKEN)}`);

    await expect(page.getByTestId("claim-mode-create")).toBeVisible();
    await expect(page.getByTestId("claim-mode-attach")).toBeVisible();
    await page.locator("#claim-agent-name").fill("UI Created Agent");

    await page.getByTestId("claim-approve").click();

    await expect(page.getByTestId("claim-status")).toContainText("CLAIMED");
    expect(claimCalled).toBe(true);
  });

  test("deny flow marks session as cancelled", async ({ page }) => {
    let denyCalled = false;

    await page.route("**/api/v1/connect/claims/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: buildPendingView({
            owner_context_available: true,
            owner_agent_limit: 1,
            owner_agents: [],
            allow_create_agent: true,
            default_mode: "create_agent"
          })
        })
      });
    });

    await page.route(`**/api/v1/connect/sessions/${SESSION_ID}/deny`, async (route) => {
      denyCalled = true;
      const body = route.request().postDataJSON();
      expect(body?.claim_token).toBe(CLAIM_TOKEN);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            session_id: SESSION_ID,
            status: "CANCELLED",
            cancelled_at: new Date().toISOString()
          }
        })
      });
    });

    await page.goto(`/claim/${encodeURIComponent(CLAIM_TOKEN)}`);

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByTestId("claim-deny").click();

    await expect(page.getByTestId("claim-status")).toContainText("CANCELLED");
    expect(denyCalled).toBe(true);
  });
});
