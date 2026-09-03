import { expect, test } from "@playwright/test";

const PUBLIC_TOOLS = ["get_page_context", "show_listings", "open_listing", "search_listings", "get_action_receipt"];

const AUTHENTICATED_TOOLS = [
  "get_page_context",
  "show_listings",
  "open_listing",
  "search_listings",
  "create_buy_mission",
  "start_thread",
  "send_message",
  "make_offer",
  "respond_to_offer",
  "request_contact_reveal",
  "get_action_receipt"
];

test.describe("WebMCP Challenge judge entry", () => {
  test.setTimeout(180_000);

  test("serves the complete judge hub in French and normalizes the locale query", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("clawdeals_api_key");
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: { registerTool: () => undefined }
      });
    });
    await page.route("**/api/v1/sandbox/reset", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false, authorized: false })
      });
    });

    await page.goto("/webmcp-challenge?locale=fr");

    await expect(page).toHaveURL(/\/fr\/webmcp-challenge$/);
    await expect(page.getByRole("heading", { name: /Votre agent négocie/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Évaluer en 60 secondes" })).toBeVisible();
    await expect(page.getByText("Ce que vous devez observer")).toBeVisible();
    const hubText = await page.getByTestId("webmcp-challenge-page").innerText();
    for (const english of [
      "Launch live demo",
      "Judge in 60 seconds",
      "What you should see",
      "Fresh judge session",
      "Copy prompt"
    ]) {
      expect(hubText).not.toContain(english);
    }
  });

  test("shows the real public registry, eligibility evidence, live demo, and copyable mission", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("clawdeals_api_key");
      (window as any).__registered = [];
      (window as any).__copied = null;
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: {
          registerTool: (tool: { name: string }) => {
            (window as any).__registered.push(tool.name);
          }
        }
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__copied = text;
          }
        }
      });
    });
    await page.route("**/api/v1/sandbox/reset", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false, authorized: false })
      });
    });

    await page.goto("/webmcp-challenge");

    await expect(page.getByTestId("webmcp-challenge-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your agent negotiates/i })).toBeVisible();
    await expect(page.getByTestId("webmcp-challenge-launch")).toHaveAttribute("href", "/webmcp");
    await expect(page.getByTestId("webmcp-challenge-supported")).toContainText("Supported");
    await expect(page.getByTestId("webmcp-challenge-registered")).toContainText("5 tools registered");

    const registered = await page.getByTestId("webmcp-challenge-registered-tool").allTextContents();
    expect(registered).toEqual(PUBLIC_TOOLS);
    await expect(page.getByTestId("webmcp-challenge-expected-tools")).toHaveText(PUBLIC_TOOLS.join(" · "));

    await page.getByTestId("webmcp-challenge-copy-prompt").click();
    await expect(page.getByTestId("webmcp-challenge-copy-prompt")).toContainText("Prompt copied");
    const copied = await page.evaluate(() => (window as any).__copied);
    expect(copied).toContain("used e-bike within 25 km of Paris");
    expect(copied).toContain("hard budget is 1,300 EUR");
    expect(copied).toContain("bilateral approval");

    await expect(page.getByRole("link", { name: "Full eligibility ledger" })).toHaveAttribute("href", /HACKATHON\.md$/);
    await expect(page.getByRole("link", { name: "WebMCP evals" })).toHaveAttribute("href", /evals\/webmcp$/);
    await expect(page.getByText("00880457964929c0773237a9c724704f5da651f0")).toBeVisible();
    await expect(page.getByTestId("webmcp-challenge-deploy-sha")).toHaveText(/^[0-9a-f]{7,12}$|^unavailable$/);
    await expect(page.getByTestId("webmcp-challenge-reset")).toBeDisabled();
  });

  test("rebuilds the same judge fixture twice and clears stale local receipts", async ({ page }) => {
    let resetCalls = 0;
    await page.addInitScript(() => {
      window.localStorage.setItem("clawdeals_api_key", "cd_test_judge_key");
      window.localStorage.setItem(
        "clawdeals:webmcp:action-receipts:v1",
        JSON.stringify([
          {
            receipt_version: "1",
            receipt_id: "stale",
            request_id: "stale",
            tool: { name: "stale" },
            timestamp: new Date().toISOString()
          }
        ])
      );
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: { registerTool: () => undefined }
      });
    });
    await page.route("**/api/v1/sandbox/reset", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: true, authorized: true })
        });
        return;
      }

      expect(request.headers().authorization).toBe("Bearer cd_test_judge_key");
      resetCalls += 1;
      expect(request.postDataJSON()).toEqual({ mode: "webmcp_challenge" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          counts: {
            deals: 3,
            listings: 7,
            watchlists: 3,
            threads: 1,
            messages: 1
          },
          thread: {
            thread_id: "91000000-0000-4000-8000-000000000001",
            listing_id: "90000000-0000-4000-8000-000000000001"
          }
        })
      });
    });

    await page.goto("/webmcp-challenge");
    await expect(page.getByTestId("webmcp-challenge-registered")).toContainText("11 tools registered");
    expect(await page.getByTestId("webmcp-challenge-registered-tool").allTextContents()).toEqual(AUTHENTICATED_TOOLS);
    await expect(page.getByTestId("webmcp-challenge-reset")).toBeEnabled();

    await page.getByTestId("webmcp-challenge-reset").evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.getByTestId("webmcp-challenge-reset-result")).toHaveText(
      "Ready: 7 listings · 1 thread · 1 message."
    );
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("clawdeals:webmcp:action-receipts:v1")))
      .toBeNull();

    await page.getByTestId("webmcp-challenge-reset").click();
    await expect.poll(() => resetCalls).toBe(2);
    await expect(page.getByTestId("webmcp-challenge-reset-result")).toHaveText(
      "Ready: 7 listings · 1 thread · 1 message."
    );
  });
});
