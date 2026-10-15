import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// CI models the browser WebMCP contract and the authenticated write endpoint.
// Native browser support and real public reads are checked separately in dogfooding.
test.beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method))
      await route.continue();
    else await route.abort();
  });
  await browser.route("**/api/v1/auth/session", async route => {
    await route.fulfill({ status: 200, json: { data: { authenticated: false } } });
  });
  await browser.addInitScript(() => {
    const state = { tools: [] as any[], responses: [] as any[], invalidResponses: 0 };
    (window as any).__missionRegression = state;
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool(tool: any, options?: { signal?: AbortSignal }) {
        state.tools.push({ tool, signal: options?.signal });
      } }
    });
    Object.defineProperty(SubmitEvent.prototype, "respondWith", {
      configurable: true,
      value(this: SubmitEvent & { agentInvoked?: boolean }, result: Promise<unknown>) {
        if (!this.agentInvoked || !this.defaultPrevented) {
          state.invalidResponses++;
          throw new DOMException("respondWith requires an agent-invoked, prevented submit", "InvalidStateError");
        }
        void result.then(value => state.responses.push(value));
      }
    });
  });
});

test("a human without an agent key gets an actionable error and can submit again", async ({ app, screen, browser }) => {
  await app.open("/fr/webmcp");
  const submit = screen.getByRole("button", "Créer la mission");
  await submit.click();
  await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "MISSING_API_KEY");
  await expect(screen.getByTestId("buy-mission-result")).toContainText("Connectez d’abord une clé agent");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(submit).toBeEnabled();
  expect(await browser.evaluate(() => (window as any).__missionRegression.invalidResponses)).toBe(0);
  await app.screenshot("human-mission-missing-key-recovered");
});

for (const initiator of ["human", "agent"] as const) {
  test(`${initiator} mission submission still requires confirmation and preserves decimal budgets`, async ({ app, screen, browser }) => {
    await browser.addInitScript(() => localStorage.setItem("clawdeals_api_key", "cd_test_dummy"));
    const writes: any[] = [];
    await browser.route("**/api/v1/watchlists", async route => {
      expect(route.request.method).toBe("POST");
      const body = JSON.parse(route.request.postData || "{}");
      writes.push(body);
      await route.fulfill({ status: 201, json: {
        ...body, watchlist_id: "11111111-1111-4111-8111-111111111111"
      } });
    });
    await app.open("/fr/webmcp");
    await screen.getByRole("textbox", "Objet recherché").fill("Vélo de test");
    await screen.getByRole("spinbutton", "Prix préféré").fill("75.50");
    await screen.getByRole("spinbutton", "Plafond absolu").fill("83.25");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    const submit = async () => {
      if (initiator === "human") await screen.getByRole("button", "Créer la mission").click();
      else await browser.evaluate(() => {
        const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "agentInvoked", { value: true });
        return document.querySelector('[data-testid="buy-mission-form"]')!.dispatchEvent(event);
      });
    };
    await submit();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    expect(writes).toHaveLength(0);
    await screen.getByRole("button", "Refuser").click();
    await expect(screen.getByTestId("buy-mission-result")).toHaveAttribute("data-code", "USER_DENIED");
    expect(writes).toHaveLength(0);
    await expect(screen.getByRole("button", "Créer la mission")).toBeEnabled();

    if (await browser.evaluate(() => innerWidth >= 640)) await screen.getByRole("button", "Réduire").click();
    await submit();
    await expect(screen.getByTestId("webmcp-confirm-modal")).toBeVisible();
    await screen.getByTestId("webmcp-confirm-primary-field").fill("0");
    await screen.getByTestId("webmcp-confirm-modal").getByRole("button", "Approuver").click();
    await expect(screen.getByTestId("webmcp-confirm-modal").getByRole("alert")).toContainText("Le montant doit être un nombre positif.");
    expect(writes).toHaveLength(0);
    await screen.getByTestId("webmcp-confirm-primary-field").fill("83.25");
    await screen.getByTestId("webmcp-confirm-modal").getByRole("button", "Approuver").click();
    await expect(screen.getByTestId("buy-mission-summary").getByRole("heading", "Vélo de test")).toBeVisible();
    await expect(screen.getByTestId("buy-mission-summary")).toContainText("83,25");
    await expect(screen.getByTestId("buy-mission-result")).toContainText("83,25");
    await expect(screen.getByRole("button", "Créer la mission")).toBeEnabled();
    expect(writes).toHaveLength(1);
    expect(writes[0].criteria.mission).toMatchObject({
      preferred_price_max: 75.5, hard_budget_max: 83.25, currency: "EUR"
    });
    expect(await browser.evaluate(() => (window as any).__missionRegression.invalidResponses)).toBe(0);
    if (initiator === "agent") {
      await expect.poll(() => browser.evaluate(() => (window as any).__missionRegression.responses.length)).toBe(2);
      expect(await browser.evaluate(() => (window as any).__missionRegression.responses.map((r: any) => r.ok))).toEqual([false, true]);
    }
    await app.screenshot(`${initiator}-mission-confirmed`);
  });
}

test("the agent and human share a 100-unit listing budget without a cents conversion", async ({ app, screen, browser }) => {
  const listings = [
    { listing_id: "11111111-1111-4111-8111-111111111111", title: "Vélo 75", price: { amount: 75, currency: "EUR" } },
    { listing_id: "22222222-2222-4222-8222-222222222222", title: "Vélo 180", price: { amount: 180, currency: "EUR" } }
  ].map(item => ({ ...item, condition: "GOOD", category: "mobility", created_at: "2026-10-06T10:00:00Z", seller: null }));
  await browser.route("**/api/v1/public/listings?*", async route => {
    const max = new URL(route.request.url).searchParams.get("price_max");
    await route.fulfill({ status: 200, json: {
      data: listings.filter(item => !max || item.price.amount <= Number(max)), next_cursor: null
    } });
  });
  await app.open("/fr/browse");
  if (await browser.evaluate(() => innerWidth < 640)) await screen.getByTestId("browse-filters-toggle").click();
  await screen.getByTestId("browse-price-max").fill("100");
  await expect(screen.getByTestId("browse-grid").getByRole("article")).toHaveCount(1);
  await expect(screen.getByRole("heading", "Vélo 75")).toBeVisible();
  await expect.poll(() => browser.evaluate(() => Boolean((window as any).__missionRegression.tools.find((r: any) => r.tool.name === "search_listings" && !r.signal?.aborted)))).toBe(true);
  const result = await browser.evaluate(async () => {
    const tool = (window as any).__missionRegression.tools.find((r: any) => r.tool.name === "search_listings" && !r.signal?.aborted).tool;
    return { description: tool.description, result: await tool.execute({ q: "vélo", price_max: 100 }, { signal: new AbortController().signal }) };
  });
  // The description is the executable contract an external agent uses to choose units.
  expect(result.description).toContain("major currency units");
  expect(result.result.ok).toBe(true);
  expect(result.result.data.items.map((item: any) => item.price.amount)).toEqual([75]);
  await expect(screen.getByTestId("browse-price-max")).toHaveValue("100");
  await expect(screen.getByTestId("browse-grid").getByRole("article")).toHaveCount(1);
  await expect(screen.getByRole("heading", "Vélo 180")).toHaveCount(0);
  await app.screenshot("agent-human-budget-100");
});
