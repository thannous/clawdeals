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
      const registrations: Array<{ tool: any; signal?: AbortSignal }> = [];
      (window as any).__webmcp_tools = tools;
      (window as any).__webmcp_tool_defs = registrations;

      const modelContext = {
        registerTool: (arg1: any, arg2: any) => {
          const name =
            typeof arg1 === "string"
              ? arg1
              : arg1 && typeof arg1 === "object"
                ? arg1.name
                : null;
          if (name) tools.push(String(name));
          if (arg1 && typeof arg1 === "object") {
            registrations.push({ tool: arg1, signal: arg2?.signal });
          }
          (window as any).__webmcp_last_register_args = [arg1, arg2];
        }
      };
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: modelContext
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

    const response = await page.goto("/dev/webmcp");
    if (response && response.status() === 404) {
      test.skip(true, "WebMCP page is disabled on this server (NEXT_PUBLIC_WEBMCP_ENABLED is not enabled).");
    }

    await expect(page.getByTestId("webmcp-page")).toBeVisible();
    await expect(page.getByTestId("webmcp-supported")).toContainText("YES");
    await expect(page.getByTestId("webmcp-registered")).toContainText("YES");
    await expect(page.getByTestId("webmcp-registered-count")).toHaveText("20");

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

    await expect(page.getByText("\"USER_DENIED\"").first()).toBeVisible();
    await expect(page.getByTestId("webmcp-activity-hud")).toBeVisible();
    await expect(page.getByTestId("webmcp-receipt-outcome")).toHaveText("denied");

    // Run again: Approve this time and ensure idempotency header is present.
    const reqPromise = page.waitForRequest((req) => req.method() === "POST" && req.url().includes("/api/v1/listings"));
    await page.getByRole("button", { name: "Run" }).evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByTestId("webmcp-confirm-modal")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Approve" }).evaluate((el) => (el as HTMLButtonElement).click());

    const req = await reqPromise;
    expect(req.headers()["idempotency-key"]).toBeTruthy();

    await expect(page.getByText("\"ok\": true")).toBeVisible();
    await expect(page.getByText("\"status\": \"DRAFT\"")).toBeVisible();

    const persisted = await page.evaluate(() => {
      const raw = window.localStorage.getItem("clawdeals:webmcp:action-receipts:v1") || "[]";
      return { raw, receipts: JSON.parse(raw) };
    });
    expect(persisted.raw).not.toContain("cd_test_dummy");
    expect(persisted.receipts).toHaveLength(2);
    expect(persisted.receipts.map((receipt: any) => receipt.outcome).sort()).toEqual([
      "denied",
      "success"
    ]);
    expect(persisted.receipts.every((receipt: any) => /^sha256:[a-f0-9]{64}$/.test(receipt.input_hash))).toBe(true);

    const successReceipt = persisted.receipts.find((receipt: any) => receipt.outcome === "success");
    const lookup = await page.evaluate(async (requestId) => {
      const registrations = ((window as any).__webmcp_tool_defs || []) as Array<{
        tool: any;
        signal?: AbortSignal;
      }>;
      const row = registrations
        .slice()
        .reverse()
        .find((entry) => entry.tool?.name === "get_action_receipt" && !entry.signal?.aborted);
      return row?.tool?.execute(
        { request_id: requestId },
        { signal: new AbortController().signal }
      );
    }, successReceipt.request_id);
    expect(lookup).toMatchObject({
      ok: true,
      data: {
        receipt_version: "1",
        request_id: successReceipt.request_id,
        outcome: "success"
      }
    });

    await page.reload();
    await expect(page.getByTestId("webmcp-activity-hud")).toContainText("3 redacted receipts");
  });

  test("re-registers contextual tools and aborts stale agent sessions", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("clawdeals_api_key");
      const registrations: Array<{ name: string; signal?: AbortSignal }> = [];
      (window as any).__webmcp_registrations = registrations;
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: {
          registerTool: (tool: { name?: string }, options?: { signal?: AbortSignal }) => {
            registrations.push({ name: String(tool?.name || ""), signal: options?.signal });
          }
        }
      });
    });

    await page.goto("/webmcp");
    await expect(page.getByTestId("webmcp-demo-page")).toBeVisible();
    await expect(page.getByTestId("webmcp-demo-registered")).toContainText("(5)");

    const registrationState = () =>
      page.evaluate(() => {
        const rows = ((window as any).__webmcp_registrations || []) as Array<{
          name: string;
          signal?: AbortSignal;
        }>;
        return {
          active: rows.filter((row) => !row.signal?.aborted).map((row) => row.name),
          aborted: rows.filter((row) => row.signal?.aborted).length,
          total: rows.length
        };
      });

    await expect.poll(registrationState).toMatchObject({
      active: expect.arrayContaining(["get_action_receipt"]),
      total: 5
    });

    await page.evaluate(() => {
      window.localStorage.setItem("clawdeals_api_key", "cd_test_agent_a");
      window.dispatchEvent(new Event("clawdeals:api-key-change"));
    });
    await expect.poll(registrationState).toMatchObject({
      active: expect.arrayContaining(["create_buy_mission", "request_contact_reveal"]),
      aborted: 5,
      total: 16
    });
    await expect(page.getByTestId("webmcp-demo-registered")).toContainText("(11)");

    await page.evaluate(() => {
      window.localStorage.setItem("clawdeals_api_key", "cd_test_agent_b");
      window.dispatchEvent(new Event("clawdeals:api-key-change"));
    });
    await expect.poll(registrationState).toMatchObject({ aborted: 16, total: 27 });

    await page.evaluate(() => {
      window.localStorage.removeItem("clawdeals_api_key");
      window.dispatchEvent(new Event("clawdeals:api-key-change"));
    });
    await expect.poll(registrationState).toMatchObject({
      active: expect.not.arrayContaining(["create_buy_mission"]),
      aborted: 27,
      total: 32
    });
    await expect(page.getByTestId("webmcp-demo-registered")).toContainText("(5)");
  });

  test("keeps get_action_receipt registered after search_listings navigates to /browse", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("clawdeals_api_key");
      const registrations: Array<{ tool: any; signal?: AbortSignal }> = [];
      (window as any).__webmcp_registrations = registrations;
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: {
          registerTool: (tool: any, options?: { signal?: AbortSignal }) => {
            registrations.push({ tool, signal: options?.signal });
          }
        }
      });
    });
    await page.route("**/api/v1/public/listings**", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              listing_id: "90000000-0000-4000-8000-000000000001",
              title: "Used e-bike",
              price: { amount: 1150, currency: "EUR" },
              seller: { verified: true }
            }
          ],
          next_cursor: null
        })
      });
    });

    await page.goto("/webmcp-challenge");
    await expect(page.getByTestId("webmcp-challenge-page")).toBeVisible();
    await expect(page.getByTestId("webmcp-challenge-registered")).toContainText("5 tools registered");

    const registrationState = () =>
      page.evaluate(() => {
        const rows = ((window as any).__webmcp_registrations || []) as Array<{
          tool?: { name?: string };
          signal?: AbortSignal;
        }>;
        const active = rows
          .filter((row) => !row.signal?.aborted)
          .map((row) => String(row.tool?.name || ""));
        return {
          active,
          aborted: rows.filter((row) => row.signal?.aborted).length,
          total: rows.length
        };
      });

    await expect.poll(registrationState).toMatchObject({
      active: [
        "get_page_context",
        "show_listings",
        "open_listing",
        "search_listings",
        "get_action_receipt"
      ],
      aborted: 0,
      total: 5
    });

    const searchResult: any = await page.evaluate(async () => {
      const rows = ((window as any).__webmcp_registrations || []) as Array<{
        tool?: { name?: string; execute?: (args: unknown, options?: unknown) => Promise<unknown> };
        signal?: AbortSignal;
      }>;
      const search = rows
        .slice()
        .reverse()
        .find((row) => row.tool?.name === "search_listings" && !row.signal?.aborted);
      if (!search?.tool?.execute) throw new Error("search_listings is not registered");
      return search.tool.execute({ q: "e-bike" }, { signal: new AbortController().signal });
    });
    expect(searchResult).toMatchObject({ ok: true });

    await expect(page).toHaveURL(/\/browse\?q=e-bike/, { timeout: 20_000 });
    await expect.poll(registrationState).toMatchObject({
      active: [
        "get_page_context",
        "show_listings",
        "open_listing",
        "search_listings",
        "get_action_receipt"
      ]
    });
    const afterNav = await registrationState();
    expect(afterNav.active).not.toContain("create_buy_mission");
    expect(afterNav.active).not.toContain("make_offer");
    expect(afterNav.active).not.toContain("resolve_approval");
    expect(afterNav.aborted).toBeGreaterThan(0);
    expect(afterNav.total).toBeGreaterThan(5);
  });

  test("binds owner approval resolution to the visible page and owner cookies", async ({ page }) => {
    const approvalId = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
    await page.addInitScript(() => {
      const registrations: Array<{ tool: any; signal?: AbortSignal }> = [];
      (window as any).__webmcp_owner_registrations = registrations;
      Object.defineProperty(document as any, "modelContext", {
        configurable: true,
        value: {
          registerTool: (tool: any, options?: { signal?: AbortSignal }) => {
            registrations.push({ tool, signal: options?.signal });
          }
        }
      });
    });

    await page.route(`**/api/v1/approvals/${approvalId}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            approval_id: approvalId,
            state: "PENDING",
            action_type: "offer_over_budget",
            action_ref: { mission_id: "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de" },
            action_payload_redacted: {
              offer: { amount: 1350, currency: "EUR" },
              policy: { reason: "hard_budget_exceeded", hard_budget_max: 1300 }
            },
            created_at: "2026-08-26T10:00:00.000Z"
          }
        })
      });
    });

    await page.route(`**/api/v1/approvals/${approvalId}:approve`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            approval_id: approvalId,
            action_type: "offer_over_budget",
            state: "APPROVED",
            resolved_at: "2026-08-26T10:01:00.000Z"
          }
        })
      });
    });

    await page.goto(`/my/approvals/${approvalId}`);
    await expect(page.getByTestId("editable-offer-approval-sheet")).toBeVisible();

    const activeToolNames = () =>
      page.evaluate(() =>
        ((window as any).__webmcp_owner_registrations || [])
          .filter((row: any) => !row.signal?.aborted)
          .map((row: any) => row.tool?.name)
      );
    await expect.poll(activeToolNames).toEqual([
      "get_page_context",
      "resolve_approval",
      "get_action_receipt"
    ]);

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes(`/api/v1/approvals/${approvalId}:approve`)
    );
    await page.evaluate(() => {
      const row = ((window as any).__webmcp_owner_registrations || []).find(
        (entry: any) => entry.tool?.name === "resolve_approval" && !entry.signal?.aborted
      );
      (window as any).__webmcp_owner_result = row.tool.execute(
        { decision: "approve", amount: 1290 },
        { signal: new AbortController().signal }
      );
    });
    await expect(page.getByTestId("webmcp-confirm-modal")).toBeVisible();
    await page
      .getByTestId("webmcp-confirm-modal")
      .getByRole("button", { name: "Approve" })
      .click();

    const request = await requestPromise;
    expect(request.headers()["authorization"]).toBeUndefined();
    expect(request.headers()["idempotency-key"]).toBeTruthy();
    expect(request.postDataJSON()).toEqual({ amount: 1290 });

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const result = await (window as any).__webmcp_owner_result;
          return result?.data?.state;
        })
      )
      .toBe("APPROVED");
  });
});
