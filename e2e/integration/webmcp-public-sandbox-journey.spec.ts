import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SANDBOX_ORIGIN = "https://sandbox.clawdeals.com";
const TARGET_LISTING_ID = "90000000-0000-4000-8000-000000000001";

function requiredSecret(name: "PUBLIC_SANDBOX_JUDGE_KEY" | "PUBLIC_SANDBOX_SELLER_KEY") {
  const value = String(process.env[name] || "").trim();
  if (!value.startsWith("cd_sandbox_") || !value.includes(".")) {
    throw new Error(`${name} must contain a synthetic sandbox API key`);
  }
  return value;
}

function assertPublicSandboxTarget() {
  for (const name of ["E2E_BASE_URL", "API_BASE_URL"] as const) {
    const value = String(process.env[name] || "").trim();
    if (value !== SANDBOX_ORIGIN) {
      throw new Error(`${name} must equal ${SANDBOX_ORIGIN}`);
    }
  }
}

async function resetJudgeFixtures(request: APIRequestContext, buyerApiKey: string) {
  const response = await request.post("/api/v1/sandbox/reset", {
    headers: { Authorization: `Bearer ${buyerApiKey}` },
    data: { mode: "webmcp_challenge" }
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function invokeRegisteredTool(
  page: Page,
  name: string,
  args: Record<string, unknown>,
  { confirm = false }: { confirm?: boolean } = {}
) {
  const invocationId = `${name}-${Date.now()}-${Math.random()}`;
  await page.evaluate(
    ({ invocationId: id, name: toolName, args: toolArgs }) => {
      const registrations = ((window as any).__webmcp_public_sandbox_tools || []) as Array<{
        tool: { name?: string; execute?: (args: unknown, options?: unknown) => Promise<unknown> };
        signal?: AbortSignal;
      }>;
      const registration = registrations
        .slice()
        .reverse()
        .find((entry) => entry.tool?.name === toolName && !entry.signal?.aborted);
      if (!registration?.tool?.execute) {
        throw new Error(`Active WebMCP tool not found: ${toolName}`);
      }
      (window as any).__webmcp_public_sandbox_invocations ||= {};
      (window as any).__webmcp_public_sandbox_invocations[id] = registration.tool.execute(
        toolArgs,
        { signal: new AbortController().signal }
      );
    },
    { invocationId, name, args }
  );

  if (confirm) {
    const modal = page.getByTestId("webmcp-confirm-modal");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Approve" }).click();
  }

  return page.evaluate(async (id) => {
    return (window as any).__webmcp_public_sandbox_invocations[id];
  }, invocationId);
}

test("public sandbox completes the buyer-seller WebMCP agreement with a redacted receipt", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
  assertPublicSandboxTarget();
  const buyerApiKey = requiredSecret("PUBLIC_SANDBOX_JUDGE_KEY");
  const sellerApiKey = requiredSecret("PUBLIC_SANDBOX_SELLER_KEY");

  await resetJudgeFixtures(request, buyerApiKey);

  await page.addInitScript((apiKey) => {
    window.localStorage.setItem("clawdeals_api_key", apiKey);
    window.localStorage.removeItem("clawdeals:webmcp:action-receipts:v1");
    (window as any).__webmcp_public_sandbox_tools = [];
    Object.defineProperty(document as any, "modelContext", {
      configurable: true,
      value: {
        registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => {
          (window as any).__webmcp_public_sandbox_tools.push({
            tool,
            signal: options?.signal
          });
        }
      }
    });
  }, buyerApiKey);

  await page.goto("/webmcp");
  await expect(page.getByTestId("webmcp-demo-registered")).toContainText("(11)");

  const missionResult: any = await invokeRegisteredTool(
    page,
    "create_buy_mission",
    {
      name: "Public submission e-bike mission",
      query: "used e-bike",
      market_code: "FR",
      location_label: "Paris",
      latitude: 48.8566,
      longitude: 2.3522,
      radius_km: 25,
      preferred_price_max: 1200,
      hard_budget_max: 1300,
      requirements: ["battery_health >= 80%"],
      autonomous_actions: ["search", "ask_question", "make_offer"],
      contact_reveal: "manual_bilateral_approval",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    { confirm: true }
  );
  expect(missionResult).toMatchObject({
    ok: true,
    data: {
      mission: {
        status: "ACTIVE",
        hard_budget_max: 1300,
        contact_reveal: "manual_bilateral_approval"
      }
    }
  });

  const offerResult: any = await invokeRegisteredTool(
    page,
    "make_offer",
    {
      mission_id: String(missionResult.data.mission.mission_id),
      listing_id: TARGET_LISTING_ID,
      amount: 1150,
      currency: "EUR",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    },
    { confirm: true }
  );
  expect(offerResult, JSON.stringify(offerResult)).toMatchObject({
    ok: true,
    data: {
      listing_id: TARGET_LISTING_ID,
      amount: 1150,
      currency: "EUR",
      status: "CREATED"
    }
  });
  const offerId = String(offerResult.data.offer_id);

  await page.evaluate((apiKey) => {
    window.localStorage.setItem("clawdeals_api_key", apiKey);
    window.dispatchEvent(new Event("clawdeals:api-key-change"));
  }, sellerApiKey);
  await expect
    .poll(() =>
      page.evaluate(() =>
        ((window as any).__webmcp_public_sandbox_tools || [])
          .filter((entry: any) => !entry.signal?.aborted)
          .map((entry: any) => entry.tool?.name)
      )
    )
    .toContain("respond_to_offer");

  const acceptResult: any = await invokeRegisteredTool(
    page,
    "respond_to_offer",
    { offer_id: offerId, action: "accept" },
    { confirm: true }
  );
  expect(acceptResult).toMatchObject({
    ok: true,
    data: {
      offer_id: offerId,
      status: "ACCEPTED",
      listing_status: "RESERVED",
      transaction: {
        listing_id: TARGET_LISTING_ID,
        accepted_offer_id: offerId,
        contact_reveal_state: "NOT_REQUESTED"
      }
    }
  });

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("clawdeals:webmcp:action-receipts:v1") || "[]";
    return { raw, receipts: JSON.parse(raw) };
  });
  const agreementReceipt = stored.receipts.find(
    (receipt: any) => receipt.tool?.name === "respond_to_offer" && receipt.outcome === "success"
  );
  expect(agreementReceipt).toMatchObject({
    receipt_version: "1",
    confirmation: "approved",
    policy: { decision: "human_approved_and_server_accepted" },
    outcome: "success"
  });
  expect(agreementReceipt.input_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(stored.raw).not.toContain(buyerApiKey);
  expect(stored.raw).not.toContain(sellerApiKey);
  expect(stored.raw).not.toMatch(/@|\+33|phone/i);

  const receiptResult: any = await invokeRegisteredTool(page, "get_action_receipt", {
    request_id: agreementReceipt.request_id
  });
  expect(receiptResult).toMatchObject({
    ok: true,
    data: {
      receipt_version: "1",
      request_id: agreementReceipt.request_id,
      outcome: "success"
    }
  });
  expect(Buffer.byteLength(JSON.stringify(receiptResult.data), "utf8")).toBeLessThanOrEqual(1500);

  const replay = await request.post(`/api/v1/offers/${encodeURIComponent(offerId)}/accept`, {
    headers: {
      Authorization: `Bearer ${sellerApiKey}`,
      "Idempotency-Key": agreementReceipt.request_id
    },
    data: { mission_id: null }
  });
  expect(replay.status(), await replay.text()).toBe(200);
  expect((await replay.json()).transaction.accepted_offer_id).toBe(offerId);

  await resetJudgeFixtures(request, buyerApiKey);
});
