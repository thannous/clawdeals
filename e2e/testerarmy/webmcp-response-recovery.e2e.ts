import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
    else await route.abort();
  });
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: false } } }));
  await browser.addInitScript(() => {
    localStorage.setItem("clawdeals_api_key", "cd_test_response_recovery_only");
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool() {} }
    });
  });
});

for (const response of [
  { label: "truncated JSON", contentType: "application/json", body: '{"watchlist_id":' },
  { label: "HTML gateway", contentType: "text/html", body: "<html>Upstream response unavailable</html>" },
  { label: "null JSON", contentType: "application/json", body: "null" },
  { label: "empty JSON object", contentType: "application/json", body: "{}" }
]) {
  test(`a successful HTTP status with ${response.label} never reports a completed mission`, async ({ app, screen, browser }) => {
    let writes = 0;
    await browser.route("**/api/v1/watchlists", async route => {
      writes += 1;
      if (writes > 1) {
        const body = JSON.parse(route.request.postData || "{}");
        await route.fulfill({ status: 201, json: {
          ...body, watchlist_id: "11111111-1111-4111-8111-111111111111"
        } });
        return;
      }
      // The server may have committed; only its response is unusable here.
      await route.fulfill({ status: 201, contentType: response.contentType, body: response.body });
    });
    await app.open("/fr/webmcp");
    await screen.getByRole("textbox", "Objet recherché").fill("Objet synthétique de reprise");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    await screen.getByTestId("webmcp-confirm-modal").getByRole("button", "Approuver").tap();
    await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "OUTCOME_UNKNOWN");
    await expect(screen.getByTestId("buy-mission-summary")).toHaveCount(0);
    await expect(screen.getByTestId("buy-mission-check-missions")).toHaveAttribute("href", "/fr/my/missions");
    expect(writes).toBe(1);
    const minimizeActivity = screen.getByRole("button", "Réduire");
    if (await minimizeActivity.isVisible()) await minimizeActivity.tap();
    await browser.evaluate(() => {
      document.querySelector('[data-testid="buy-mission-form"] button[type="submit"]')
        ?.scrollIntoView({ block: "center" });
      return true;
    });
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "OUTCOME_UNKNOWN");
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toBe(1);
    await app.screenshot(`webmcp-unusable-${response.label.replaceAll(" ", "-")}`);

    // Editing the brief deliberately remains possible, but still requires a new
    // confirmation. It is distinct from retrying the unconfirmed write above.
    await screen.getByRole("textbox", "Objet recherché").fill("Autre mission synthétique");
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    expect(writes).toBe(1);
    await screen.getByTestId("webmcp-confirm-modal").getByRole("button", "Approuver").tap();
    await expect(screen.getByTestId("buy-mission-summary")).toBeVisible();
    await expect(screen.getByTestId("buy-mission-summary").getByText("Autre mission synthétique")).toBeVisible();
    expect(writes).toBe(2);
  });
}

test("an edited confirmation protects the approved mission without blocking the original brief", async ({ app, screen, browser }) => {
  const submittedQueries: string[] = [];
  await browser.route("**/api/v1/watchlists", async route => {
    const body = JSON.parse(route.request.postData || "{}");
    submittedQueries.push(body.criteria.query);
    if (submittedQueries.length === 1) {
      await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
    } else {
      await route.fulfill({ status: 201, json: {
        ...body, watchlist_id: "22222222-2222-4222-8222-222222222222"
      } });
    }
  });

  await app.open("/fr/webmcp");
  await screen.getByRole("textbox", "Objet recherché").fill("Mission initiale A");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  await screen.getByText("Avancé · paramètres bruts").tap();
  const editedJson = await browser.evaluate(() => {
    const editor = document.querySelector('[data-testid="webmcp-confirm-advanced"] textarea') as HTMLTextAreaElement;
    const args = JSON.parse(editor.value);
    args.query = "Mission approuvée B";
    return JSON.stringify(args);
  });
  await screen.getByRole("textbox", "Modifier les paramètres JSON de l’outil").fill(editedJson);
  await screen.getByRole("button", "Approuver la version modifiée").tap();
  await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "OUTCOME_UNKNOWN");
  expect(submittedQueries).toEqual(["Mission approuvée B"]);

  const minimizeActivity = screen.getByRole("button", "Réduire");
  if (await minimizeActivity.isVisible()) await minimizeActivity.tap();
  await screen.getByRole("textbox", "Objet recherché").fill("Mission approuvée B");
  await browser.evaluate(() => {
    document.querySelector('[data-testid="buy-mission-form"] button[type="submit"]')?.scrollIntoView({ block: "center" });
    return true;
  });
  await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
  await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "OUTCOME_UNKNOWN");
  expect(submittedQueries).toEqual(["Mission approuvée B"]);

  await screen.getByRole("textbox", "Objet recherché").fill("Mission initiale A");
  await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  expect(submittedQueries).toEqual(["Mission approuvée B"]);
  await screen.getByRole("button", "Approuver", { exact: true }).tap();
  await expect(screen.getByTestId("buy-mission-summary").getByText("Mission initiale A")).toBeVisible();
  expect(submittedQueries).toEqual(["Mission approuvée B", "Mission initiale A"]);
  await app.screenshot("webmcp-edited-approval-recovery");
});
