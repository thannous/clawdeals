import { test, expect } from "@playwright/test";

test.describe("Dev WebMCP demo", () => {
  // First-run Next.js dev compilation can be slow on WSL/Windows filesystems.
  test.setTimeout(180_000);

  test("registers tools, blocks writes via confirm gate, and injects Idempotency-Key on approve", async ({ page }) => {
    await page.addInitScript(() => {
      // Provide a dummy API key for the in-browser WebMCP tool HTTP helper.
      try {
        window.localStorage.setItem("clawdeals_api_key", "cd_test_dummy");
      } catch {
        // ignore
      }

      // Stub WebMCP capability in Playwright.
      const tools: string[] = [];
      (window as any).__webmcp_tools = tools;

      Object.defineProperty(navigator as any, "modelContext", {
        configurable: true,
        value: {
          registerTool: (arg1: any, arg2: any, arg3: any) => {
            const name =
              typeof arg1 === "string"
                ? arg1
                : arg1 && typeof arg1 === "object"
                  ? arg1.name
                  : null;
            if (name) tools.push(String(name));
            // Keep a reference to the handler so the page can call it if needed.
            (window as any).__webmcp_last_register_args = [arg1, arg2, arg3];
          }
        }
      });
    });

    await page.route("**/api/v1/listings", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.fallback();

      const headers = req.headers();
      const idem = headers["idempotency-key"] || headers["Idempotency-Key".toLowerCase()];
      if (!idem) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Idempotency-Key is required", details: {} } })
        });
      }

      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ listing_id: "l1", status: "DRAFT", created_at: new Date().toISOString() })
      });
    });

    await page.goto("/dev/webmcp");

    await expect(page.getByTestId("webmcp-page")).toBeVisible();
    await expect(page.getByTestId("webmcp-supported")).toContainText("YES");
    await expect(page.getByTestId("webmcp-registered")).toContainText("YES");
    await expect(page.getByTestId("webmcp-registered-count")).toHaveText("8");

    // Select a write tool and run it: Deny first.
    const createDraftButton = page
      .locator("button")
      .filter({ hasText: "clawdeals.listings_create_draft" })
      .first();
    // Next.js dev overlay uses <nextjs-portal> which can intercept pointer events; bypass via DOM click().
    await createDraftButton.evaluate((el) => (el as HTMLButtonElement).click());

    // Ensure the selection actually applied (prevents accidentally running the default read tool).
    // The default expect timeout (5s) can be tight on first-run dev compilation.
    await expect(page.locator("textarea")).toHaveValue(/price_amount_minor/, { timeout: 20_000 });

    // Next.js dev overlay uses <nextjs-portal> which can intercept pointer events; bypass via DOM click().
    await page.getByRole("button", { name: "Run" }).evaluate((el) => (el as HTMLButtonElement).click());

    await expect(page.getByTestId("webmcp-confirm-modal")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Deny" }).evaluate((el) => (el as HTMLButtonElement).click());

    await expect(page.getByText("\"USER_DENIED\"")).toBeVisible();

    // Run again: Approve this time and ensure idempotency header is present.
    const reqPromise = page.waitForRequest((req) => req.method() === "POST" && req.url().includes("/api/v1/listings"));
    await page.getByRole("button", { name: "Run" }).evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByTestId("webmcp-confirm-modal")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Approve" }).evaluate((el) => (el as HTMLButtonElement).click());

    const req = await reqPromise;
    expect(req.headers()["idempotency-key"]).toBeTruthy();

    await expect(page.getByText("\"ok\": true")).toBeVisible();
    await expect(page.getByText("\"status\": \"DRAFT\"")).toBeVisible();
  });
});
