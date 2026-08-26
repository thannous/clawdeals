import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { assertIntegrationEnv } from "../integration/helpers/env";
import { createCounterOffer, expectStatus } from "../integration/helpers/http";
import {
  createActiveApiKeyDb,
  createSupabaseAdmin,
  ensureOwnerDb
} from "../integration/helpers/supabase";

assertIntegrationEnv();

const PLAN_REPO_URL =
  "https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md";
const PLAN_DRIVE_URL =
  "https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk";
const JUDGE_AGENT_ID = "93000000-0000-4000-8000-000000000001";
const JUDGE_OWNER_ID = "94000000-0000-4000-8000-000000000001";
const TARGET_LISTING_ID = "90000000-0000-4000-8000-000000000001";
const OUTPUT_DIR = path.resolve("test-results/hackathon-video");
const FRAME_DIR = path.join(OUTPUT_DIR, "frames");
const CAPTION_DIR = path.join(OUTPUT_DIR, "caption-overlays");
const RAW_VIDEO_PATH = path.join(OUTPUT_DIR, "clawdeals-webmcp-demo-raw.mp4");

type ToolResult = {
  ok: boolean;
  data?: any;
  error?: { code?: string; details?: Record<string, any> };
  meta?: { request_id?: string };
};

async function invokeRegisteredTool(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const invocationId = `${name}-${Date.now()}-${Math.random()}`;
  await page.evaluate(
    ({ invocationId: id, name: toolName, args: toolArgs }) => {
      const registrations = ((window as any).__hackathon_capture_tools || []) as Array<{
        tool: { name?: string; execute?: (input: unknown, options: unknown) => Promise<unknown> };
        signal?: AbortSignal;
      }>;
      const registration = registrations
        .slice()
        .reverse()
        .find((entry) => entry.tool?.name === toolName && !entry.signal?.aborted);
      if (!registration?.tool?.execute) {
        throw new Error(`Active WebMCP tool not found: ${toolName}`);
      }
      (window as any).__hackathon_capture_invocations ||= {};
      (window as any).__hackathon_capture_invocations[id] = registration.tool.execute(toolArgs, {
        signal: new AbortController().signal
      });
    },
    { invocationId, name, args }
  );
  return page.evaluate(async (id) => {
    return (window as any).__hackathon_capture_invocations[id];
  }, invocationId);
}

async function approveVisibleConfirmation(page: Page) {
  const modal = page.getByTestId("webmcp-confirm-modal");
  await expect(modal).toBeVisible();
  await modal
    .getByRole("button", { name: "Approve" })
    .evaluate((element) => (element as HTMLButtonElement).click());
}

async function startToolInvocation(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<{ result: Promise<ToolResult> }> {
  const result = invokeRegisteredTool(page, name, args);
  await expect(page.getByTestId("webmcp-confirm-modal")).toBeVisible();
  return { result };
}

async function loginOwner(page: Page, email: string) {
  const start = await page.request.post("/api/v1/auth/login:start", { data: { email } });
  await expectStatus(start, 201);
  const started = await start.json();
  const confirm = await page.request.post("/api/v1/auth/login:confirm", {
    data: {
      session_id: started.data.session_id,
      token: started.data.session_token
    }
  });
  await expectStatus(confirm, 200);
}

async function setAgentKey(page: Page, apiKey: string) {
  await page.evaluate((key) => {
    window.localStorage.setItem("clawdeals_api_key", key);
    window.dispatchEvent(new Event("clawdeals:api-key-change"));
  }, apiKey);
}

async function waitForTool(page: Page, name: string) {
  await expect
    .poll(() =>
      page.evaluate((toolName) => {
        return ((window as any).__hackathon_capture_tools || []).some(
          (entry: any) => entry.tool?.name === toolName && !entry.signal?.aborted
        );
      }, name)
    )
    .toBe(true);
}

async function minimizeActivityHud(page: Page) {
  const hud = page.getByTestId("webmcp-activity-hud");
  if (!(await hud.isVisible().catch(() => false))) return;
  const button = hud.getByRole("button", { name: "Minimize" });
  if (await button.isVisible().catch(() => false)) await button.click();
}

test("records the deterministic WebMCP victory journey", async ({ page, request }) => {
  test.setTimeout(6 * 60 * 1000);
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  await ensureOwnerDb(supabase, JUDGE_OWNER_ID);
  const buyerEmail = "judge-buyer@clawdeals.local";
  const { error: buyerOwnerError } = await supabase
    .from("owners")
    .update({
      email: buyerEmail,
      email_verified_at: now,
      phone_e164: "+33600000001",
      phone_verified_at: now,
      updated_at: now
    })
    .eq("owner_id", JUDGE_OWNER_ID);
  if (buyerOwnerError) throw buyerOwnerError;

  const { error: agentError } = await supabase.from("agents").upsert({
    id: JUDGE_AGENT_ID,
    owner_id: JUDGE_OWNER_ID,
    name: "WebMCP Submission Judge",
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    trust_score: 70,
    trust_flags: []
  });
  if (agentError) throw agentError;
  const { error: oldKeysError } = await supabase
    .from("api_keys")
    .delete()
    .eq("agent_id", JUDGE_AGENT_ID);
  if (oldKeysError) throw oldKeysError;
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, JUDGE_AGENT_ID);

  const reset = await request.post("/api/v1/sandbox/reset", {
    headers: { Authorization: `Bearer ${buyerApiKey}` },
    data: { mode: "webmcp_challenge" }
  });
  await expectStatus(reset, 200);
  const resetBody = await reset.json();
  const sellerAgentId = String(resetBody.actors?.seller_agent_id || "");
  expect(sellerAgentId).toBeTruthy();
  const { data: sellerAgent, error: sellerAgentError } = await supabase
    .from("agents")
    .select("owner_id")
    .eq("id", sellerAgentId)
    .single();
  if (sellerAgentError) throw sellerAgentError;
  const sellerOwnerId = String(sellerAgent.owner_id || "");
  const sellerEmail = "judge-seller@clawdeals.local";
  const { error: sellerOwnerError } = await supabase
    .from("owners")
    .update({
      email: sellerEmail,
      email_verified_at: now,
      phone_e164: "+33600000002",
      phone_verified_at: now,
      updated_at: now
    })
    .eq("owner_id", sellerOwnerId);
  if (sellerOwnerError) throw sellerOwnerError;
  const { error: oldSellerKeysError } = await supabase
    .from("api_keys")
    .delete()
    .eq("agent_id", sellerAgentId);
  if (oldSellerKeysError) throw oldSellerKeysError;
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgentId);

  await page.addInitScript((apiKey) => {
    window.localStorage.setItem("clawdeals_api_key", apiKey);
    (window as any).__hackathon_capture_tools = [];
    Object.defineProperty(document as any, "modelContext", {
      configurable: true,
      value: {
        registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => {
          (window as any).__hackathon_capture_tools.push({
            tool,
            signal: options?.signal
          });
        }
      }
    });
  }, buyerApiKey);

  await page.goto("/webmcp-challenge");
  await expect(page.getByTestId("webmcp-challenge-page")).toBeVisible();
  await expect(page.getByTestId("webmcp-challenge-registered")).toContainText("11 tools registered");
  await rm(FRAME_DIR, { recursive: true, force: true });
  await rm(CAPTION_DIR, { recursive: true, force: true });
  await rm(path.join(OUTPUT_DIR, "capture-metadata.json"), { force: true });
  await mkdir(FRAME_DIR, { recursive: true });
  await mkdir(CAPTION_DIR, { recursive: true });
  const shots: Array<{ file: string; duration_seconds: number }> = [];
  const shot = async (name: string, durationSeconds: number) => {
    const file = path.join(FRAME_DIR, `${name}.jpg`);
    await page.screenshot({
      path: file,
      type: "jpeg",
      quality: 90,
      animations: "disabled"
    });
    shots.push({ file: path.relative(path.resolve("."), file), duration_seconds: durationSeconds });
  };
  await shot("00-hero", 12);

  await test.step("capture the sandbox journey and caption overlays", async () => {
    await page.goto("/webmcp");
    await expect(page.getByTestId("webmcp-demo-registered")).toContainText("(11)");
    await page.getByTestId("buy-mission-form").scrollIntoViewIfNeeded();

    const { result: missionPromise } = await startToolInvocation(page, "create_buy_mission", {
      name: "Paris e-bike mission",
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
    });
    await shot("01-mission-confirm", 10);
    await approveVisibleConfirmation(page);
    const missionResult = await missionPromise;
    expect(missionResult).toMatchObject({ ok: true, data: { mission: { hard_budget_max: 1300 } } });
    const missionId = String(missionResult.data.mission.mission_id);
    await expect(page.getByTestId("buy-mission-summary")).toBeVisible();
    await page.getByTestId("buy-mission-summary").scrollIntoViewIfNeeded();
    await shot("02-mission-summary", 13);

    const searchResult = await invokeRegisteredTool(page, "search_listings", {
      q: "used e-bike",
      latitude: 48.8566,
      longitude: 2.3522,
      radius_km: 25,
      preferred_price_max: 1200,
      hard_budget_max: 1300,
      requirements: ["battery_health >= 80%"],
      limit: 5
    });
    expect(searchResult).toMatchObject({ ok: true });
    await page.getByTestId("browse-grid").scrollIntoViewIfNeeded();
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(5);
    await shot("03-search-policy-fit", 25);

    const { result: threadPromise } = await startToolInvocation(page, "start_thread", {
      listing_id: TARGET_LISTING_ID,
      intent: "BUY",
      initial_question: "Please confirm battery health and recent service history."
    });
    await shot("04-thread-confirm", 6);
    await approveVisibleConfirmation(page);
    const threadResult = await threadPromise;
    expect(threadResult).toMatchObject({ ok: true });
    const threadId = String(threadResult.data.thread_id);

    const { result: messagePromise } = await startToolInvocation(page, "send_message", {
      thread_id: threadId,
      type: "question",
      text: "Please confirm battery health and recent service history."
    });
    await shot("05-message-confirm", 5);
    await approveVisibleConfirmation(page);
    expect(await messagePromise).toMatchObject({ ok: true });

    const { result: offerPromise } = await startToolInvocation(page, "make_offer", {
      mission_id: missionId,
      listing_id: TARGET_LISTING_ID,
      thread_id: threadId,
      amount: 1100,
      currency: "EUR",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    await shot("06-offer-1100-confirm", 11);
    await approveVisibleConfirmation(page);
    const offerResult = await offerPromise;
    expect(offerResult).toMatchObject({ ok: true, data: { amount: 1100, status: "CREATED" } });

    const sellerCounter = await createCounterOffer(
      request,
      sellerApiKey,
      String(offerResult.data.offer_id),
      {
        amount: 1350,
        currency: "EUR",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      },
      { idempotencyKey: `capture-counter-${Date.now()}` }
    );
    await expectStatus(sellerCounter, 201);
    const sellerCounterBody = await sellerCounter.json();

    const { result: blockedAcceptPromise } = await startToolInvocation(page, "respond_to_offer", {
      offer_id: sellerCounterBody.offer_id,
      action: "accept",
      mission_id: missionId
    });
    await approveVisibleConfirmation(page);
    const blockedAccept = await blockedAcceptPromise;
    expect(blockedAccept).toMatchObject({ ok: false, error: { code: "APPROVAL_REQUIRED" } });
    const approvalId = String(blockedAccept.error?.details?.approval_id || "");
    expect(approvalId).toBeTruthy();
    await shot("07-policy-block", 6);

    await loginOwner(page, buyerEmail);
    await page.goto(`/my/approvals/${approvalId}`);
    await expect(page.getByTestId("editable-offer-approval-sheet")).toBeVisible();
    await minimizeActivityHud(page);
    await page.getByTestId("editable-offer-approval-sheet").scrollIntoViewIfNeeded();
    await shot("08-owner-approval", 5);
    await page.getByTestId("approval-offer-amount").fill("1290");
    await shot("09-owner-edit-1290", 7);
    await page.getByRole("button", { name: /approve/i }).click();
    await expect(page.getByTestId("my-approval-detail-page")).toContainText("APPROVED");

    const { data: approvedCounters, error: approvedCounterError } = await supabase
      .from("offers")
      .select("offer_id")
      .eq("previous_offer_id", sellerCounterBody.offer_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (approvedCounterError) throw approvedCounterError;
    const approvedCounterId = String(approvedCounters?.[0]?.offer_id || "");
    expect(approvedCounterId).toBeTruthy();

    await page.goto("/webmcp");
    await setAgentKey(page, sellerApiKey);
    await waitForTool(page, "respond_to_offer");
    const { result: acceptPromise } = await startToolInvocation(page, "respond_to_offer", {
      offer_id: approvedCounterId,
      action: "accept"
    });
    await approveVisibleConfirmation(page);
    const accepted = await acceptPromise;
    expect(accepted).toMatchObject({
      ok: true,
      data: { listing_status: "RESERVED", transaction: { contact_reveal_state: "NOT_REQUESTED" } }
    });
    const transactionId = String(accepted.data.transaction.tx_id);
    await shot("10-reserved", 10);

    await setAgentKey(page, buyerApiKey);
    await waitForTool(page, "request_contact_reveal");
    const { result: revealPromise } = await startToolInvocation(page, "request_contact_reveal", {
      tx_id: transactionId
    });
    await shot("11-contact-request", 4);
    await approveVisibleConfirmation(page);
    const reveal = await revealPromise;
    expect(reveal).toMatchObject({
      ok: true,
      data: {
        contact_reveal_state: "REQUESTED",
        consent_states: { buyer: "PENDING", seller: "PENDING" }
      }
    });
    const buyerConsentId = String(reveal.data.approval_id);
    await page.goto(`/my/approvals/${buyerConsentId}`);
    await expect(page.getByTestId("contact-reveal-consent-sheet")).toBeVisible();
    await minimizeActivityHud(page);
    await page.getByTestId("contact-reveal-consent-sheet").scrollIntoViewIfNeeded();
    await shot("12-contact-consent", 3);
    await page.getByRole("button", { name: /approve/i }).click();
    await expect(page.getByTestId("my-approval-detail-page")).toContainText("APPROVED");
    await expect(page.getByTestId("my-approval-detail-page")).toContainText(/both|bilateral/i);
    await shot("13-one-consent", 3);

    await page.goto("/webmcp");
    await setAgentKey(page, buyerApiKey);
    await waitForTool(page, "get_action_receipt");
    const acceptanceRequestId = await page.evaluate(() => {
      const raw = window.localStorage.getItem("clawdeals:webmcp:action-receipts:v1") || "[]";
      const receipts = JSON.parse(raw);
      const acceptance = receipts.find(
        (entry: any) => entry.tool?.name === "respond_to_offer" && entry.outcome === "success"
      );
      return String(acceptance?.request_id || "");
    });
    expect(acceptanceRequestId).toBeTruthy();
    const receipt = await invokeRegisteredTool(page, "get_action_receipt", {
      request_id: acceptanceRequestId
    });
    expect(receipt).toMatchObject({ ok: true, data: { receipt_version: "1", outcome: "success" } });
    await expect(page.getByTestId("webmcp-activity-hud")).toBeVisible();
    await shot("14-redacted-receipt", 22);

    await page.goto("/webmcp-challenge");
    await page.getByRole("heading", { name: "Built after August 25" }).scrollIntoViewIfNeeded();
    await shot("15-architecture", 10);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.getByRole("heading", { name: /Your agent negotiates/i })).toBeVisible();
    await shot("16-close", 8);

    const storedReceipts = await page.evaluate(() =>
      window.localStorage.getItem("clawdeals:webmcp:action-receipts:v1") || ""
    );
    expect(storedReceipts).not.toContain(buyerApiKey);
    expect(storedReceipts).not.toContain(sellerApiKey);
    expect(storedReceipts).not.toMatch(/judge-(buyer|seller)@|\+3360000000[12]/i);
    const durationSeconds = shots.reduce((total, entry) => total + entry.duration_seconds, 0);
    expect(durationSeconds).toBe(160);
    await writeFile(
      path.join(OUTPUT_DIR, "capture-metadata.json"),
      `${JSON.stringify(
        {
          kind: "clawdeals-webmcp-hackathon-shot-capture",
          proof_layer: "LOCAL",
          duration_seconds: durationSeconds,
          shot_count: shots.length,
          shots
        },
        null,
        2
      )}\n`
    );

    const subtitleSource = await readFile(
      path.resolve("docs/hackathon/DEMO_SUBTITLES.srt"),
      "utf8"
    );
    const captionTexts = subtitleSource
      .trim()
      .split(/\r?\n\r?\n+/)
      .map((block) => block.split(/\r?\n/).slice(2).join(" ").trim());
    expect(captionTexts).toHaveLength(16);
    for (const [index, captionText] of captionTexts.entries()) {
      const escapedCaption = captionText
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      await page.setContent(`
        <style>
          html, body { width: 1920px; height: 1080px; margin: 0; background: transparent; overflow: hidden; }
          .caption { position: absolute; left: 150px; bottom: 74px; width: 1620px; box-sizing: border-box;
            padding: 20px 42px; border-radius: 10px; background: rgba(5, 5, 5, 0.84); color: white;
            font: 600 32px/1.35 Arial, Helvetica, sans-serif; text-align: center; }
        </style>
        <div class="caption">${escapedCaption}</div>
      `);
      await page.screenshot({
        path: path.join(CAPTION_DIR, `cue-${String(index + 1).padStart(2, "0")}.png`),
        type: "png",
        omitBackground: true,
        animations: "disabled"
      });
    }
  });

  console.log(
    JSON.stringify({
      proof_layer: "LOCAL",
      kind: "clawdeals-webmcp-hackathon-raw-capture",
      video_path: RAW_VIDEO_PATH,
      plan_repo_url: PLAN_REPO_URL,
      plan_drive_url: PLAN_DRIVE_URL
    })
  );
});
