import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { assertIntegrationEnv } from "../integration/helpers/env";
import { expectStatus } from "../integration/helpers/http";
import {
  createActiveApiKeyDb,
  createSupabaseAdmin,
  ensureOwnerDb
} from "../integration/helpers/supabase";

assertIntegrationEnv();

const JUDGE_AGENT_ID = "93000000-0000-4000-8000-000000000001";
const JUDGE_OWNER_ID = "94000000-0000-4000-8000-000000000001";
const TARGET_LISTING_ID = "90000000-0000-4000-8000-000000000001";
const OUTPUT_DIR = path.resolve("test-results/hackathon-video-v2");
const FRAME_DIR = path.join(OUTPUT_DIR, "frames");
const CAPTION_DIR = path.join(OUTPUT_DIR, "caption-overlays");
const SUBTITLE_PATH = path.resolve("docs/hackathon/DEMO_VIDEO_V2_SUBTITLES.srt");

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
  return page.evaluate(async (id) => (window as any).__hackathon_capture_invocations[id], invocationId);
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

async function approveVisibleConfirmation(page: Page) {
  const modal = page.getByTestId("webmcp-confirm-modal");
  await expect(modal).toBeVisible();
  await modal
    .getByRole("button", { name: "Approve" })
    .evaluate((element) => (element as HTMLButtonElement).click());
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

async function expandActivityHud(page: Page) {
  const hud = page.getByTestId("webmcp-activity-hud");
  await expect(hud).toBeVisible();
  if ((await hud.getAttribute("data-collapsed")) === "true") {
    await hud.getByRole("button", { name: /expand/i }).click();
  }
}

async function addSceneOverlay(page: Page, title: string, detail?: string) {
  await page.evaluate(
    ({ title: sceneTitle, detail: sceneDetail }) => {
      document.getElementById("hackathon-v2-scene-overlay")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "hackathon-v2-scene-overlay";
      overlay.setAttribute("data-capture-overlay", "true");
      overlay.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "top:34px",
        "left:50%",
        "transform:translateX(-50%)",
        "max-width:1500px",
        "padding:14px 28px",
        "border:1px solid rgba(86,255,169,.65)",
        "background:rgba(5,9,12,.9)",
        "box-shadow:0 16px 60px rgba(0,0,0,.45)",
        "color:#f5f7f8",
        "font:700 28px/1.2 Arial,Helvetica,sans-serif",
        "letter-spacing:.01em",
        "text-align:center",
        "pointer-events:none"
      ].join(";");
      const heading = document.createElement("div");
      heading.textContent = sceneTitle;
      overlay.appendChild(heading);
      if (sceneDetail) {
        const note = document.createElement("div");
        note.textContent = sceneDetail;
        note.style.cssText =
          "margin-top:5px;color:#56ffa9;font:600 15px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase";
        overlay.appendChild(note);
      }
      document.body.appendChild(overlay);
    },
    { title, detail: detail || "" }
  );
}

async function removeSceneOverlay(page: Page) {
  await page.evaluate(() => document.getElementById("hackathon-v2-scene-overlay")?.remove());
}

test("records the 138-second ClawDeals demo video V2", async ({ page, request }) => {
  test.setTimeout(8 * 60 * 1000);
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();
  const buyerEmail = "judge-buyer@clawdeals.local";

  await ensureOwnerDb(supabase, JUDGE_OWNER_ID);
  const { error: ownerError } = await supabase
    .from("owners")
    .update({
      email: buyerEmail,
      email_verified_at: now,
      phone_e164: "+33600000001",
      phone_verified_at: now,
      updated_at: now
    })
    .eq("owner_id", JUDGE_OWNER_ID);
  if (ownerError) throw ownerError;

  const { error: agentError } = await supabase.from("agents").upsert({
    id: JUDGE_AGENT_ID,
    owner_id: JUDGE_OWNER_ID,
    name: "WebMCP Demo V2 Agent",
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    trust_score: 70,
    trust_flags: []
  });
  if (agentError) throw agentError;
  const { error: oldKeysError } = await supabase.from("api_keys").delete().eq("agent_id", JUDGE_AGENT_ID);
  if (oldKeysError) throw oldKeysError;
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, JUDGE_AGENT_ID);

  const reset = await request.post("/api/v1/sandbox/reset", {
    headers: { Authorization: `Bearer ${buyerApiKey}` },
    data: { mode: "webmcp_challenge" }
  });
  await expectStatus(reset, 200);

  const { data: currentPolicy, error: currentPolicyError } = await supabase
    .from("policies")
    .select("version")
    .eq("owner_id", JUDGE_OWNER_ID)
    .maybeSingle();
  if (currentPolicyError) throw currentPolicyError;
  const policyVersion = Number(currentPolicy?.version || 0) + 1;
  const policyJson = {
    version: policyVersion,
    budgets: { max_offer: 1000, preferred_offer: 900, currency: "EUR" },
    approval_thresholds: { offer_amount_gt: 900, contact_reveal: "always" },
    auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
    mission_defaults: {
      radius_km: 25,
      autonomous_actions: ["search", "ask_question", "make_offer"]
    },
    quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: "Europe/Paris" },
    allowlist_agent_ids: [],
    denylist_agent_ids: []
  };
  const { error: policyError } = await supabase.from("policies").upsert(
    {
      owner_id: JUDGE_OWNER_ID,
      version: policyVersion,
      policy_json: policyJson,
      updated_at: now
    },
    { onConflict: "owner_id" }
  );
  if (policyError) throw policyError;

  const { data: staleWatchlists, error: staleWatchlistsError } = await supabase
    .from("watchlists")
    .select("watchlist_id,criteria")
    .eq("agent_id", JUDGE_AGENT_ID)
    .is("deleted_at", null);
  if (staleWatchlistsError) throw staleWatchlistsError;
  const staleFollowIds = (staleWatchlists || [])
    .filter((row: any) => row.criteria?.kind === "listing_follow" && row.criteria?.listing_id === TARGET_LISTING_ID)
    .map((row: any) => row.watchlist_id);
  if (staleFollowIds.length > 0) {
    const { error: cleanupError } = await supabase.from("watchlists").delete().in("watchlist_id", staleFollowIds);
    if (cleanupError) throw cleanupError;
  }

  await page.addInitScript((apiKey) => {
    window.localStorage.setItem("clawdeals_api_key", apiKey);
    (window as any).__hackathon_capture_tools = [];
    Object.defineProperty(document as any, "modelContext", {
      configurable: true,
      value: {
        registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => {
          (window as any).__hackathon_capture_tools.push({ tool, signal: options?.signal });
        }
      }
    });
  }, buyerApiKey);
  await loginOwner(page, buyerEmail);

  await rm(FRAME_DIR, { recursive: true, force: true });
  await rm(CAPTION_DIR, { recursive: true, force: true });
  await mkdir(FRAME_DIR, { recursive: true });
  await mkdir(CAPTION_DIR, { recursive: true });
  const shots: Array<{ file: string; duration_seconds: number; scene: string }> = [];
  const shot = async (
    name: string,
    durationSeconds: number,
    scene: string,
    detail?: string
  ) => {
    await addSceneOverlay(page, scene, detail);
    const file = path.join(FRAME_DIR, `${name}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 92, animations: "disabled" });
    await removeSceneOverlay(page);
    shots.push({
      file: path.relative(path.resolve("."), file),
      duration_seconds: durationSeconds,
      scene
    });
  };

  await page.goto(`/browse/${TARGET_LISTING_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("e-bike");
  await expect(page.getByText(/€1,150/)).toBeVisible();
  await page.getByTestId("listing-gallery").scrollIntoViewIfNeeded();
  await shot("01a-listing-proof", 7, "From listing to agent mission in one click", "€1,150 · Paris · FR");
  await page.getByTestId("listing-ask-agent").click();
  await expect(page).toHaveURL(new RegExp(`/webmcp\\?listing=${TARGET_LISTING_ID}`));
  await expect(page.getByTestId("buy-mission-prefill-note")).toBeVisible();
  await page.locator('[name="preferred_price_max"]').fill("900");
  await page.locator('[name="hard_budget_max"]').fill("1000");
  await page.getByTestId("buy-mission-form").scrollIntoViewIfNeeded();
  await shot("01b-prefilled-mission", 8, "From listing to agent mission in one click", "Listing context already attached");

  await waitForTool(page, "create_buy_mission");
  const { result: missionPromise } = await startToolInvocation(page, "create_buy_mission", {
    name: "Paris bicycle purchase",
    query: "used e-bike",
    market_code: "FR",
    location_label: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    radius_km: 25,
    preferred_price_max: 900,
    hard_budget_max: 1000,
    requirements: ["battery_health >= 80%"],
    autonomous_actions: ["search", "ask_question", "make_offer"],
    contact_reveal: "manual_bilateral_approval",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  await shot("02a-mission-confirm", 6, "Discovery → decision → action", "Explicit authority before execution");
  await approveVisibleConfirmation(page);
  const missionResult = await missionPromise;
  expect(missionResult).toMatchObject({ ok: true });
  const missionId = String(missionResult.data.mission.mission_id);
  const searchResult = await invokeRegisteredTool(page, "search_listings", {
    q: "used e-bike",
    latitude: 48.8566,
    longitude: 2.3522,
    radius_km: 25,
    preferred_price_max: 900,
    hard_budget_max: 1000,
    requirements: ["battery_health >= 80%"],
    limit: 5
  });
  expect(searchResult).toMatchObject({ ok: true });
  await expect(page.getByTestId("buy-mission-summary")).toBeVisible();
  await page.getByTestId("buy-mission-summary").scrollIntoViewIfNeeded();
  await shot("02b-agent-result", 11, "Discovery → decision → action", "Structured search completed");

  await page.goto("/settings/policy");
  await expect(page.getByTestId("policy-form")).toBeVisible();
  await page.getByTestId("policy-budget-section").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("policy-hard-ceiling")).toHaveValue("1000");
  await expect(page.getByTestId("policy-approval-threshold")).toHaveValue("900");
  await shot("03a-policy", 7, "The agent can act — but only within your rules", "Hard ceiling €1,000 · approval above €900");

  await page.goto("/webmcp");
  await setAgentKey(page, buyerApiKey);
  await waitForTool(page, "start_thread");
  const { result: threadPromise } = await startToolInvocation(page, "start_thread", {
    listing_id: TARGET_LISTING_ID,
    intent: "BUY",
    initial_question: "Please confirm battery health and service history."
  });
  await approveVisibleConfirmation(page);
  const threadResult = await threadPromise;
  expect(threadResult).toMatchObject({ ok: true });
  const threadId = String(threadResult.data.thread_id);

  const { result: blockedPromise } = await startToolInvocation(page, "make_offer", {
    mission_id: missionId,
    listing_id: TARGET_LISTING_ID,
    thread_id: threadId,
    amount: 1150,
    currency: "EUR",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  await approveVisibleConfirmation(page);
  const blocked = await blockedPromise;
  expect(blocked.ok).toBe(false);
  expect(["APPROVAL_REQUIRED", "FORBIDDEN"]).toContain(blocked.error?.code);
  await expandActivityHud(page);
  await shot("03b-policy-block", 7, "The agent can act — but only within your rules", "€1,150 blocked above the €1,000 ceiling");

  const { result: allowedPromise } = await startToolInvocation(page, "make_offer", {
    mission_id: missionId,
    listing_id: TARGET_LISTING_ID,
    thread_id: threadId,
    amount: 850,
    currency: "EUR",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  await approveVisibleConfirmation(page);
  const allowed = await allowedPromise;
  expect(allowed).toMatchObject({ ok: true, data: { amount: 850 } });
  await expandActivityHud(page);
  await shot("03c-policy-allowed", 7, "The agent can act — but only within your rules", "€850 accepted inside policy");

  await page.goto("/browse");
  await expect(page.getByTestId("browse-grid")).toBeVisible();
  await shot("04a-marketplace-grid", 5, "A marketplace designed for humans and agents", "France · Spain · United Kingdom");
  await page.goto(`/browse/${TARGET_LISTING_ID}`);
  await expect(page.getByTestId("listing-gallery-thumb-1")).toBeVisible();
  await page.getByTestId("listing-gallery-thumb-1").click();
  await shot("04b-gallery", 5, "A marketplace designed for humans and agents", "Keyboard-ready product gallery");
  await page.getByTestId("listing-location").scrollIntoViewIfNeeded();
  await shot("04c-location", 4, "A marketplace designed for humans and agents", "Paris · FR · map context");
  await page.getByTestId("listing-similar").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("listing-similar")).toBeVisible();
  await shot("04d-similar", 5, "A marketplace designed for humans and agents", "Same category · same market");

  await page.getByTestId("listing-human-actions").scrollIntoViewIfNeeded();
  const followButton = page.getByTestId("listing-follow");
  await expect(followButton).toBeEnabled();
  if (!/following/i.test((await followButton.textContent()) || "")) await followButton.click();
  await expect(page.getByTestId("listing-follow-server-hint")).toBeVisible();
  await shot("05a-follow", 6, "Persistent follows. Actionable price drops.", "Saved through the connected owner agent");

  await page.goto("/my/watchlists");
  await expect(page.getByTestId("owner-watchlists")).toContainText("Used e-bike");
  await shot("05b-watchlist", 7, "Persistent follows. Actionable price drops.", "Available beyond this browser");

  const { data: listingBefore, error: listingBeforeError } = await supabase
    .from("listings")
    .select("price_amount")
    .eq("listing_id", TARGET_LISTING_ID)
    .single();
  if (listingBeforeError) throw listingBeforeError;
  const originalPrice = Number(listingBefore.price_amount);
  const loweredPrice = Math.max(1, originalPrice - 75);
  const { error: lowerPriceError } = await supabase
    .from("listings")
    .update({ price_amount: loweredPrice, updated_at: new Date().toISOString() })
    .eq("listing_id", TARGET_LISTING_ID);
  if (lowerPriceError) throw lowerPriceError;
  await expect
    .poll(async () => {
      const { data } = await supabase
        .from("watchlist_match_queue")
        .select("last_reason")
        .eq("entity_type", "listing")
        .eq("entity_id", TARGET_LISTING_ID)
        .maybeSingle();
      return data?.last_reason || null;
    })
    .toBe("listing_price_drop");
  await shot("05c-price-drop", 7, "Persistent follows. Actionable price drops.", `Verified sandbox event · €${originalPrice} → €${loweredPrice} · queued`);
  const { error: restorePriceError } = await supabase
    .from("listings")
    .update({ price_amount: originalPrice, updated_at: new Date().toISOString() })
    .eq("listing_id", TARGET_LISTING_ID);
  if (restorePriceError) throw restorePriceError;

  await page.goto("/webmcp");
  await setAgentKey(page, buyerApiKey);
  await expect(page.getByTestId("webmcp-demo-registered")).toContainText("(11)");
  await page.getByRole("heading", { name: "Registered tools" }).scrollIntoViewIfNeeded();
  await shot("06a-webmcp-tools", 6, "Built for WebMCP-native commerce", "Discoverable purchasing tools");
  await expandActivityHud(page);
  await shot("06b-structured-result", 7, "Built for WebMCP-native commerce", "Structured inputs, permissions, and results");
  await page.goto("/fr/webmcp");
  await expect(page.getByTestId("webmcp-demo-page")).toBeVisible();
  await page.getByTestId("buy-mission-form").scrollIntoViewIfNeeded();
  await shot("06c-localized", 5, "Built for WebMCP-native commerce", "Localized guidance · France");

  await page.goto("/settings/policy#decision-history");
  await expect(page.getByTestId("policy-history")).toBeVisible();
  await expect(page.getByTestId("policy-history")).not.toContainText("No policy decisions recorded yet");
  await page.getByTestId("policy-history").scrollIntoViewIfNeeded();
  await shot("07a-policy-history", 9, "Every important decision leaves evidence", "Blocked and allowed outcomes");
  const receiptLink = page.getByTestId("policy-history").getByRole("link", { name: /Receipt/i }).first();
  await expect(receiptLink).toBeVisible();
  const receiptHref = await receiptLink.getAttribute("href");
  expect(receiptHref).toBeTruthy();
  await page.goto(receiptHref!);
  await page.evaluate(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "150px 120px 120px";
    document.body.style.background = "#05090c";
    document.body.style.color = "#f5f7f8";
    document.body.style.font = "24px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace";
    document.body.style.whiteSpace = "pre-wrap";
    document.body.style.overflowWrap = "anywhere";
  });
  await shot("07b-receipt", 8, "Every important decision leaves evidence", "Request ID · policy reason · decision");

  const montageFiles = ["04a-marketplace-grid.jpg", "03a-policy.jpg", "02b-agent-result.jpg"];
  const montageUris = await Promise.all(
    montageFiles.map(async (file) => `data:image/jpeg;base64,${(await readFile(path.join(FRAME_DIR, file))).toString("base64")}`)
  );
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; margin: 0; overflow: hidden; background: #05090c; color: #f5f7f8; }
      body { font-family: Arial, Helvetica, sans-serif; }
      .grid { position: absolute; inset: 86px 80px 250px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
      .panel { position: relative; overflow: hidden; border: 1px solid rgba(86,255,169,.45); background: #0b1115; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
      .panel img { width: 100%; height: 100%; object-fit: cover; }
      .panel::after { content: ''; position: absolute; inset: 0; box-shadow: inset 0 0 70px rgba(5,9,12,.55); }
      .brand { position: absolute; left: 0; right: 0; bottom: 76px; text-align: center; }
      .brand strong { display: block; color: #56ffa9; font: 800 58px/1 Arial,Helvetica,sans-serif; letter-spacing: .06em; }
      .brand span { display: block; margin-top: 18px; color: #f5f7f8; font: 600 28px/1.2 Arial,Helvetica,sans-serif; }
      .brand small { display: block; margin-top: 15px; color: #9fb0ba; font: 600 18px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing: .12em; }
    </style>
    <div class="grid">
      ${montageUris.map((uri) => `<div class="panel"><img src="${uri}" alt="" /></div>`).join("")}
    </div>
    <div class="brand"><strong>CLAWDEALS</strong><span>Ready when your agent is.</span><small>CLAWDEALS.COM</small></div>
  `);
  await shot("08-closing", 11, "ClawDeals — Ready when your agent is.", "clawdeals.com");

  const durationSeconds = shots.reduce((total, entry) => total + entry.duration_seconds, 0);
  expect(durationSeconds).toBe(138);
  await writeFile(
    path.join(OUTPUT_DIR, "capture-metadata.json"),
    `${JSON.stringify(
      {
        kind: "clawdeals-demo-video-v2-shot-capture",
        proof_layer: "LOCAL",
        data_environment: "isolated sandbox",
        publication_status: "NOT_PUBLISHED",
        duration_seconds: durationSeconds,
        shot_count: shots.length,
        shots
      },
      null,
      2
    )}\n`
  );

  const subtitleSource = await readFile(SUBTITLE_PATH, "utf8");
  const captionTexts = subtitleSource
    .trim()
    .split(/\r?\n\r?\n+/)
    .map((block) => block.split(/\r?\n/).slice(2).join(" ").trim());
  expect(captionTexts.length).toBeGreaterThanOrEqual(8);
  for (const [index, captionText] of captionTexts.entries()) {
    const escapedCaption = captionText
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    await page.setContent(`
      <style>
        html, body { width: 1920px; height: 1080px; margin: 0; background: transparent; overflow: hidden; }
        .caption { position: absolute; left: 180px; bottom: 58px; width: 1560px; box-sizing: border-box;
          padding: 17px 34px; border: 1px solid rgba(255,255,255,.12); border-radius: 9px;
          background: rgba(5,9,12,.9); color: white; font: 600 30px/1.32 Arial,Helvetica,sans-serif; text-align: center; }
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
