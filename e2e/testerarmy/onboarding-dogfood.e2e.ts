import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// These synthetic client responses exercise browser recovery and navigation.
// They do not create agents, pair a Telegram account, or send a message.
const syntheticKey = "cd_test_onboarding_dogfood_only";
const agent = {
  agent_id: "11111111-1111-4111-8111-111111111111",
  name: "Dogfood Agent",
  owner_id: "22222222-2222-4222-8222-222222222222"
};

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    const url = new URL(route.request.url);
    if (url.origin !== origin || !["GET", "HEAD"].includes(route.request.method)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
});

test("API setup keeps the generated key and retries verification without registering again", async ({ app, screen, browser }) => {
  let registrations = 0;
  let identityReads = 0;
  let identityUnavailable = true;
  await browser.route("**/api/v1/auth/session", route => route.fulfill({
    status: 200, json: { data: { authenticated: false } }
  }));
  await browser.route("**/api/v1/agents", route => {
    registrations += 1;
    return route.fulfill({ status: 201, json: { data: { agent_id: agent.agent_id, api_key: syntheticKey } } });
  });
  await browser.route("**/api/v1/agents/me", route => {
    identityReads += 1;
    return route.fulfill(identityUnavailable ? {
      status: 503, json: { error: { code: "UNAVAILABLE", message: "Temporary identity service outage" } }
    } : { status: 200, json: { data: agent } });
  });
  await app.open("/start");
  await screen.getByTestId("connect-method-api").tap();
  await screen.getByTestId("generate-key").tap();
  await expect(screen.getByTestId("continue-after-generate")).toBeVisible();
  await expect(screen.getByTestId("mcp-installed")).toHaveCount(0);
  await screen.getByTestId("continue-after-generate").tap();
  await expect(screen.getByRole("alert").filter({ hasText: "Temporary identity service outage" })).toBeVisible();
  const readsBeforeRetry = identityReads;
  identityUnavailable = false;
  await screen.getByRole("button", "Try again").tap();
  await expect(screen.getByRole("heading", "You're connected")).toBeVisible();
  expect(registrations).toBe(1);
  expect(identityReads).toBe(readsBeforeRetry + 1);
  await app.screenshot("api-verification-recovered");
});

test("an owner finishes MCP installation before the wizard marks setup complete", async ({ app, screen, browser }) => {
  let identityReads = 0;
  await browser.route("**/api/v1/auth/session", route => route.fulfill({
    status: 200, json: { data: { authenticated: true, owner_id: agent.owner_id } }
  }));
  await browser.route("**/api/v1/agents", route => route.fulfill({
    status: 201, json: { data: { agent_id: agent.agent_id, api_key: syntheticKey } }
  }));
  await browser.route("**/api/v1/agents/me", route => {
    identityReads += 1;
    return route.fulfill({ status: 200, json: { data: agent } });
  });
  await app.open("/start");
  await expect(screen.getByTestId("connect-account-unlock")).toHaveCount(0);
  await screen.getByTestId("mcp-generate-key").tap();
  await expect.poll(() => identityReads).toBeGreaterThan(0);
  await expect(screen.getByTestId("mcp-installed")).toBeVisible();
  await screen.getByTestId("mcp-installed").tap();
  await expect(screen.getByRole("heading", "Verify MCP installation")).toBeVisible();
  await screen.getByRole("button", "Verify").tap();
  await expect(screen.getByRole("heading", "You're connected")).toBeVisible();
  await app.screenshot("mcp-installation-completed");
});

test("French Telegram pairing offers sign-in with the exact return link after an expired session", async ({ app, screen, browser }) => {
  let ownerAuthenticated = false;
  await browser.route("**/api/v1/auth/session", route => route.fulfill({
    status: 200, json: { data: { authenticated: ownerAuthenticated, owner_id: ownerAuthenticated ? agent.owner_id : null } }
  }));
  await browser.route("**/api/console/channels/telegram/pair:confirm", route => route.fulfill(ownerAuthenticated ? {
    status: 200, json: { data: { state: "PAIRED" } }
  } : {
    status: 401, json: { error: { code: "UNAUTHORIZED", message: "Unauthorized" } }
  }));
  await app.open("/fr/pair?token=synthetic-pair-token");
  await screen.getByRole("button", "Confirmer l’association").tap();
  await expect(screen.getByRole("alert").filter({ hasText: "Connecte-toi" })).toBeVisible();
  await screen.getByRole("link", "Se connecter").tap();
  await expect(browser).toHaveURL(/\/fr\/auth\/login\?/);
  expect(new URL(await browser.url()).searchParams.get("next")).toBe("/fr/pair?token=synthetic-pair-token");
  await expect(screen.getByText("/fr/pair?token=synthetic-pair-token")).toBeVisible();
  // Model the owner session restored by sign-in; no external authentication.
  ownerAuthenticated = true;
  await browser.reload();
  await expect(browser).toHaveURL(new URL("/fr/pair?token=synthetic-pair-token", app.baseUrl).href);
  await screen.getByRole("button", "Confirmer l’association").tap();
  await expect(screen.getByRole("status")).toContainText("Association réussie");
  await app.screenshot("pairing-sign-in-recovery");
});

test("a confirmed Telegram pairing cannot be submitted a second time", async ({ app, screen, browser }) => {
  let confirmations = 0;
  await browser.route("**/api/console/channels/telegram/pair:confirm", route => {
    confirmations += 1;
    return route.fulfill({ status: 200, json: { data: { state: "PAIRED" } } });
  });
  await app.open("/pair?token=synthetic-pair-token");
  await screen.getByRole("button", "Confirm Pairing").tap();
  await expect(screen.getByRole("status")).toContainText("Paired");
  await expect(screen.getByRole("button", "Confirm Pairing")).toBeDisabled();
  expect(confirmations).toBe(1);
  await expect(screen.getByRole("link", "Connected apps")).toBeVisible();
  await app.screenshot("pairing-confirmed");
});
