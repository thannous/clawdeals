import { beforeEach, test, type Browser } from "@e2e-dev/web";
import { expect } from "e2e";

async function revealSubmit(browser: Browser) {
  await browser.evaluate(() => {
    document.querySelector('[data-testid="buy-mission-form"] button[type="submit"]')?.scrollIntoView({ block: "center" });
    return null;
  });
}

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
  { label: "empty JSON object", contentType: "application/json", body: "{}" },
  { label: "empty nested mission", contentType: "application/json", body: JSON.stringify({ watchlist_id: "11111111-1111-4111-8111-111111111111", criteria: { mission: {} } }) },
  { label: "non UUID identifier", contentType: "application/json", body: "invalid-id" },
  { label: "server JSON error", status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "ERROR", message: "Response lost after write" } }) },
  { label: "server HTML error", status: 503, contentType: "text/html", body: "<html>Unavailable</html>" }
]) {
  test(`a successful HTTP status with ${response.label} never reports a completed mission`, async ({ app, screen, browser }) => {
    let writes = 0;
    const requests: Array<{ body: string; key: string }> = [];
    await browser.route("**/api/v1/watchlists", async route => {
      writes += 1;
      requests.push({ body: route.request.postData || "", key: route.request.headers["idempotency-key"] });
      if (writes > 1) {
        const body = JSON.parse(route.request.postData || "{}");
        await route.fulfill({ status: 201, json: {
          ...body, watchlist_id: "11111111-1111-4111-8111-111111111111"
        } });
        return;
      }
      // The server may have committed; only its response is unusable here.
      await route.fulfill(response.body === "invalid-id" ? {
        status: 201, json: { ...JSON.parse(route.request.postData || "{}"), watchlist_id: "not-a-uuid" }
      } : { status: response.status || 201, contentType: response.contentType, body: response.body });
    });
    await app.open("/fr/webmcp");
    await screen.getByRole("textbox", "Objet recherché").fill("Objet synthétique de reprise");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    await revealSubmit(browser);
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
    // A changed form cannot bypass the unresolved approved write. Reconcile it
    // with the exact body/key first; only then allow a separately approved intent.
    await screen.getByRole("textbox", "Objet recherché").fill("Autre mission synthétique");
    await screen.getByRole("spinbutton", "Plafond absolu").fill("2500");
    await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("buy-mission-summary").getByText("Objet synthétique de reprise")).toBeVisible();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toBe(2);
    expect(requests[1]).toEqual(requests[0]);
    await expect(screen.getByTestId("buy-mission-result")).toContainText("1 300");
    expect(requests[0].key).toBeTruthy();
    await app.screenshot(`webmcp-recovered-${response.label.replaceAll(" ", "-")}`);

    await screen.getByRole("textbox", "Objet recherché").fill("Objet synthétique de reprise");
    await screen.getByRole("spinbutton", "Plafond absolu").fill("1300");
    await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toBe(2);
    await screen.getByRole("textbox", "Objet recherché").fill("Autre mission synthétique");
    await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    expect(writes).toBe(2);
    await screen.getByTestId("webmcp-confirm-modal").getByRole("button", "Approuver").tap();
    await expect(screen.getByTestId("buy-mission-summary").getByText("Autre mission synthétique")).toBeVisible();
    expect(writes).toBe(3);
    expect(requests[2].key).not.toBe(requests[0].key);
  });
}

test("an edited confirmation replays the approved payload before accepting a different brief", async ({ app, screen, browser }) => {
  const submittedQueries: string[] = [];
  const requests: Array<{ body: string; key: string }> = [];
  await browser.route("**/api/v1/watchlists", async route => {
    const body = JSON.parse(route.request.postData || "{}");
    submittedQueries.push(body.criteria.query);
    requests.push({ body: route.request.postData || "", key: route.request.headers["idempotency-key"] });
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
  await revealSubmit(browser);
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
  // The form still contains A; the approved request was B. Recovery must use B.
  await browser.evaluate(() => {
    document.querySelector('[data-testid="buy-mission-form"] button[type="submit"]')?.scrollIntoView({ block: "center" });
    return true;
  });
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
  await expect(screen.getByTestId("buy-mission-summary").getByText("Mission approuvée B")).toBeVisible();
  expect(submittedQueries).toEqual(["Mission approuvée B", "Mission approuvée B"]);
  expect(requests[1]).toEqual(requests[0]);
  await screen.getByRole("textbox", "Objet recherché").fill("Mission approuvée B");
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
  expect(submittedQueries).toHaveLength(2);

  await screen.getByRole("textbox", "Objet recherché").fill("Mission initiale A");
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  expect(submittedQueries).toEqual(["Mission approuvée B", "Mission approuvée B"]);
  await screen.getByRole("button", "Approuver", { exact: true }).tap();
  await expect(screen.getByTestId("buy-mission-summary").getByText("Mission initiale A")).toBeVisible();
  expect(submittedQueries).toEqual(["Mission approuvée B", "Mission approuvée B", "Mission initiale A"]);
  expect(requests[2].key).not.toBe(requests[0].key);
  await app.screenshot("webmcp-edited-approval-recovery");
});

test("concurrent submissions join the pending confirmation and request", async ({ app, screen, browser }) => {
  let writes = 0;
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await browser.route("**/api/v1/watchlists", async route => {
    writes += 1;
    await responseReady;
    await route.fulfill({ status: 201, json: { ...JSON.parse(route.request.postData || "{}"), watchlist_id: "33333333-3333-4333-8333-333333333333" } });
  });
  try {
    await app.open("/fr/webmcp");
    await screen.getByRole("textbox", "Objet recherché").fill("Mission simultanée");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    await browser.evaluate(() => {
      const form = document.querySelector('[data-testid="buy-mission-form"]') as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
      return null;
    });
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(1);
    await screen.getByRole("button", "Approuver", { exact: true }).tap();
    await expect.poll(() => writes).toBe(1);
    await browser.evaluate(() => {
      const form = document.querySelector('[data-testid="buy-mission-form"]') as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
      return null;
    });
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toBe(1);
    release();
    await expect(screen.getByTestId("buy-mission-summary").getByText("Mission simultanée")).toBeVisible();
    await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toBe(1);
  } finally { release(); }
});

test("a key changed during confirmation must approve again as the new agent", async ({ app, screen, browser }) => {
  const actors: string[] = [];
  await browser.route("**/api/v1/watchlists", async route => {
    actors.push(route.request.headers.authorization);
    await route.fulfill({ status: 201, json: { ...JSON.parse(route.request.postData || "{}"), watchlist_id: "44444444-4444-4444-8444-444444444444" } });
  });
  await app.open("/fr/webmcp");
  await screen.getByRole("textbox", "Objet recherché").fill("Mission changement agent");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  await browser.evaluate(() => {
    localStorage.setItem("clawdeals_api_key", "cd_test_agent_B");
    window.dispatchEvent(new Event("clawdeals:api-key-change"));
    return null;
  });
  await screen.getByRole("button", "Approuver", { exact: true }).tap();
  await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "UNAUTHORIZED");
  expect(actors).toHaveLength(0);
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  await screen.getByRole("button", "Approuver", { exact: true }).tap();
  await expect(screen.getByTestId("buy-mission-summary")).toBeVisible();
  expect(actors).toEqual(["Bearer cd_test_agent_B"]);
});

test("a late response remains with its original agent and known success restores without a write", async ({ app, screen, browser }) => {
  let writes = 0;
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await browser.route("**/api/v1/watchlists", async route => {
    writes += 1;
    expect(route.request.headers.authorization).toBe("Bearer cd_test_response_recovery_only");
    await responseReady;
    await route.fulfill({ status: 201, json: { ...JSON.parse(route.request.postData || "{}"), watchlist_id: "55555555-5555-4555-8555-555555555555" } });
  });
  try {
    await app.open("/fr/webmcp");
    await screen.getByRole("textbox", "Objet recherché").fill("Mission agent A");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    await screen.getByRole("button", "Approuver", { exact: true }).tap();
    await expect.poll(() => writes).toBe(1);
    await browser.evaluate(() => {
      localStorage.setItem("clawdeals_api_key", "cd_test_agent_B");
      window.dispatchEvent(new Event("clawdeals:api-key-change"));
    return null;
    });
    release();
    await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "UNAUTHORIZED");
    await expect(screen.getByTestId("buy-mission-summary")).toHaveCount(0);
    await browser.evaluate(() => {
      localStorage.setItem("clawdeals_api_key", "cd_test_response_recovery_only");
      window.dispatchEvent(new Event("clawdeals:api-key-change"));
    return null;
    });
    await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
    await expect(screen.getByTestId("buy-mission-summary").getByText("Mission agent A")).toBeVisible();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toHaveCount(0);
    expect(writes).toBe(1);
  } finally { release(); }
});

test("an initial definitive rejection permits a newly confirmed request", async ({ app, screen, browser }) => {
  const keys: string[] = [];
  await browser.route("**/api/v1/watchlists", async route => {
    keys.push(route.request.headers["idempotency-key"]);
    if (keys.length === 1) await route.fulfill({ status: 403, json: { error: { code: "FORBIDDEN", message: "Agent forbidden" } } });
    else await route.fulfill({ status: 201, json: { ...JSON.parse(route.request.postData || "{}"), watchlist_id: "66666666-6666-4666-8666-666666666666" } });
  });
  await app.open("/fr/webmcp");
  await screen.getByRole("textbox", "Objet recherché").fill("Mission rejet puis nouvelle demande");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  await screen.getByRole("button", "Approuver", { exact: true }).tap();
  await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "FORBIDDEN");
  await revealSubmit(browser);
    await screen.getByRole("button", "Créer la mission").tap();
  await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
  await screen.getByRole("button", "Approuver", { exact: true }).tap();
  await expect(screen.getByTestId("buy-mission-summary")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).not.toBe(keys[0]);
});
