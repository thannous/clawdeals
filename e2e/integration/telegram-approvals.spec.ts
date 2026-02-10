import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, acceptOffer, expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function makeTelegramTextUpdate({ text, fromId, chatId, updateId, messageId }: any) {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      text,
      from: { id: fromId, username: "itest" },
      chat: { id: chatId, type: "private" }
    }
  };
}

function makeTelegramCallbackUpdate({
  data,
  fromId,
  chatId,
  updateId,
  messageId,
  callbackQueryId,
  dateSeconds
}: any) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    update_id: updateId,
    callback_query: {
      id: callbackQueryId || `cb-${updateId}`,
      from: { id: fromId, username: "itest" },
      data,
      message: {
        message_id: messageId,
        date: typeof dateSeconds === "number" ? dateSeconds : nowSec,
        chat: { id: chatId, type: "private" }
      }
    }
  };
}

function findCallbackData(replyMarkup: any, buttonText: string): string | null {
  const rows = replyMarkup?.inline_keyboard;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (!button) continue;
      if (button.text === buttonText && typeof button.callback_data === "string") {
        return button.callback_data;
      }
    }
  }
  return null;
}

function extractApprovalIdsFromTelegramText(text: string): string[] {
  const out: string[] = [];
  const re = /\bid:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(String(text || "")))) {
    out.push(m[1]);
  }
  return out;
}

async function insertTelegramIdentity({
  supabase,
  ownerId,
  role,
  fromId,
  chatId
}: {
  supabase: any;
  ownerId: string;
  role: "viewer" | "approver" | "owner";
  fromId: number;
  chatId: number;
}) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("channel_identities")
    .insert({
      channel_type: "telegram",
      channel_user_id: String(fromId),
      channel_context_id: String(chatId),
      display_name: "itest",
      owner_id: ownerId,
      role,
      state: "ACTIVE",
      approved_at: nowIso,
      approved_by_human_id: ownerId,
      created_at: nowIso,
      last_seen_at: nowIso
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function setVerifiedOwnerContact(
  supabase: any,
  ownerId: string,
  { email, phoneE164 }: { email: string; phoneE164: string }
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("owners")
    .update({
      email,
      email_verified_at: now,
      phone_e164: phoneE164,
      phone_verified_at: now,
      updated_at: now
    })
    .eq("owner_id", ownerId);
  if (error) throw error;
}

const contactRoutesExist = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/request-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/approve-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/deny-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id].ts")
].every((candidate) => fs.existsSync(candidate));

test.describe.serial("Integration: Telegram approvals (TI-299)", () => {
  test.setTimeout(60000);

  test("/approvals renders an inline keyboard", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `TG approvals listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadBody = await threadRes.json();
    const approvalId = threadBody?.data?.approval_id;
    expect(typeof approvalId).toBe("string");

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    await insertTelegramIdentity({ supabase, ownerId, role: "approver", fromId, chatId });

    const webhookRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/approvals",
        fromId,
        chatId,
        updateId: 300000 + nonce,
        messageId: 400000 + nonce
      })
    });
    await expectStatus(webhookRes, 200);
    const body = await webhookRes.json();

    expect(body?.method).toBe("sendMessage");
    expect(String(body?.text || "")).toMatch(/\bApprovals\b/i);
    expect(String(body?.text || "")).toContain(String(approvalId));
    expect(body?.reply_markup?.inline_keyboard?.length).toBeGreaterThan(0);

    const approveCb = findCallbackData(body.reply_markup, "Approve 1");
    const denyCb = findCallbackData(body.reply_markup, "Deny 1");
    const backCb = findCallbackData(body.reply_markup, "Back");
    expect(approveCb).toBeTruthy();
    expect(denyCb).toBeTruthy();
    expect(backCb).toBeTruthy();
  });

  test("pagination: Next shows the following page", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `TG approvals pagination ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    for (let i = 0; i < 4; i += 1) {
      const buyerOwnerId = randomId();
      await ensureOwnerDb(supabase, buyerOwnerId);
      const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
      const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

      const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
        headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(threadRes, 202);
    }

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    await insertTelegramIdentity({ supabase, ownerId, role: "approver", fromId, chatId });

    const page1Res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/approvals",
        fromId,
        chatId,
        updateId: 300000 + nonce,
        messageId: 400000 + nonce
      })
    });
    await expectStatus(page1Res, 200);
    const page1 = await page1Res.json();
    expect(page1?.method).toBe("sendMessage");
    expect(page1?.reply_markup?.inline_keyboard?.length).toBeGreaterThan(0);

    const page1Ids = extractApprovalIdsFromTelegramText(String(page1?.text || ""));
    expect(page1Ids.length).toBeGreaterThan(0);

    const nextCb = findCallbackData(page1.reply_markup, "Next");
    expect(nextCb).toBeTruthy();
    expect(String(nextCb)).toMatch(/^cd:approvals\.page/);

    const page2Res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: nextCb,
        fromId,
        chatId,
        updateId: 310000 + nonce,
        messageId: 999,
        callbackQueryId: `cb-next-${nonce}`
      })
    });
    await expectStatus(page2Res, 200);
    const page2 = await page2Res.json();
    expect(page2?.method).toBe("editMessageText");

    const page2Ids = extractApprovalIdsFromTelegramText(String(page2?.text || ""));
    expect(page2Ids.length).toBeGreaterThan(0);
    expect(page2Ids.some((id) => !page1Ids.includes(id))).toBe(true);
  });

  test("double-approve is stable (already resolved does not error)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `TG approvals double ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadBody = await threadRes.json();
    const approvalId = threadBody?.data?.approval_id;
    expect(typeof approvalId).toBe("string");

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    await insertTelegramIdentity({ supabase, ownerId, role: "approver", fromId, chatId });

    const listRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/approvals",
        fromId,
        chatId,
        updateId: 300000 + nonce,
        messageId: 400000 + nonce
      })
    });
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    const approveCb = findCallbackData(listBody.reply_markup, "Approve 1");
    expect(approveCb).toBeTruthy();

    const approve1Res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: approveCb,
        fromId,
        chatId,
        updateId: 310000 + nonce,
        messageId: 1001,
        callbackQueryId: `cb-approve-1-${nonce}`
      })
    });
    await expectStatus(approve1Res, 200);
    const approve1Body = await approve1Res.json();
    expect(approve1Body?.method).toBe("editMessageText");
    expect(String(approve1Body?.text || "")).toMatch(/\bApproved\b/i);

    const { data: apRow1, error: apErr1 } = await supabase.from("approvals").select("approval_id,state").eq("approval_id", approvalId).single();
    if (apErr1) throw apErr1;
    expect(apRow1.state).toBe("APPROVED");

    const approve2Res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: approveCb,
        fromId,
        chatId,
        updateId: 320000 + nonce,
        messageId: 1001,
        callbackQueryId: `cb-approve-2-${nonce}`
      })
    });
    await expectStatus(approve2Res, 200);
    const approve2Body = await approve2Res.json();
    expect(approve2Body?.method).toBe("editMessageText");
    expect(String(approve2Body?.text || "")).toMatch(/Already resolved/i);

    const { data: apRow2, error: apErr2 } = await supabase.from("approvals").select("approval_id,state").eq("approval_id", approvalId).single();
    if (apErr2) throw apErr2;
    expect(apRow2.state).toBe("APPROVED");
  });

  test("contact reveal approval uses step-up (CONFIRM code) before resolving", async ({ request }) => {
    test.skip(!contactRoutesExist, "Contact reveal endpoints not implemented in this branch");

    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 1000, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    await setVerifiedOwnerContact(supabase, ownerId, {
      email: `itest+seller-${ownerId.split("-")[0]}@example.com`,
      phoneE164: "+33600001234"
    });
    await setVerifiedOwnerContact(supabase, buyerOwnerId, {
      email: `itest+buyer-${buyerOwnerId.split("-")[0]}@example.com`,
      phoneE164: "+33612345678"
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `TG approvals contact reveal ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer(
      request,
      buyerApiKey,
      listingId,
      { threadId: null, amount: 10, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(offerRes, 201);
    const offerBody = await offerRes.json();
    const offerId = offerBody.offer_id;
    expect(typeof offerId).toBe("string");

    const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);
    const acceptBody = await acceptRes.json();
    const txId = acceptBody.transaction?.tx_id;
    expect(typeof txId).toBe("string");

    const reqRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/request-contact-reveal`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(reqRes, 202);
    const reqBody = await reqRes.json();
    const approvalId = reqBody.approval_id;
    expect(typeof approvalId).toBe("string");

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    await insertTelegramIdentity({ supabase, ownerId, role: "approver", fromId, chatId });

    const listRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/approvals",
        fromId,
        chatId,
        updateId: 300000 + nonce,
        messageId: 400000 + nonce
      })
    });
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    expect(String(listBody?.text || "")).toContain(String(approvalId));

    const approveCb = findCallbackData(listBody.reply_markup, "Approve 1");
    expect(approveCb).toBeTruthy();

    const stepRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: approveCb,
        fromId,
        chatId,
        updateId: 310000 + nonce,
        messageId: 2001,
        callbackQueryId: `cb-stepup-${nonce}`
      })
    });
    await expectStatus(stepRes, 200);
    const stepBody = await stepRes.json();
    expect(stepBody?.method).toBe("editMessageText");
    expect(String(stepBody?.text || "")).toMatch(/Confirmation required/i);
    expect(String(stepBody?.text || "")).toMatch(/\bCONFIRM\b/i);

    const m = String(stepBody?.text || "").match(/\bCONFIRM\s+([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6})\b/i);
    expect(m?.[1]).toBeTruthy();
    const code = String(m![1]).toUpperCase();

    const confirmRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: `CONFIRM ${code}`,
        fromId,
        chatId,
        updateId: 320000 + nonce,
        messageId: 400001 + nonce
      })
    });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody?.method).toBe("sendMessage");
    expect(String(confirmBody?.text || "")).toMatch(/\bApproved\b/i);

    const { data: apRow, error: apErr } = await supabase.from("approvals").select("approval_id,state,action_type").eq("approval_id", approvalId).single();
    if (apErr) throw apErr;
    expect(apRow.action_type).toBe("contact_reveal");
    expect(apRow.state).toBe("APPROVED");
  });
});

