import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb } from "./helpers/supabase";

assertIntegrationEnv();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function makeTelegramUpdate({ text, fromId, chatId, updateId, messageId }: any) {
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

test.describe.serial("Integration: Telegram pairing (TI-296)", () => {
  test.setTimeout(60000);

  test("web -> telegram (/start) creates PENDING by default policy (requires approval)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const startRes = await request.post("/api/v1/channels/telegram/pair:start", {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(startRes, 201);
    const startBody = await startRes.json();
    const pairToken = startBody?.data?.pair_token;
    expect(pairToken).toBeTruthy();

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    // Avoid collisions across repeated runs (Redis anti-replay uses chat_id + message_id).
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    const updateId = 300000 + nonce;
    const messageId = 400000 + nonce;

    const webhookRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: `/start ${pairToken}`,
        fromId,
        chatId,
        updateId,
        messageId
      })
    });
    await expectStatus(webhookRes, 200);

    const { data: identity, error: idErr } = await supabase
      .from("channel_identities")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("channel_type", "telegram")
      .eq("channel_user_id", String(fromId))
      .eq("channel_context_id", String(chatId))
      .neq("state", "REVOKED")
      .maybeSingle();
    if (idErr) throw idErr;
    expect(identity).toBeTruthy();
    expect(identity.state).toBe("PENDING");

    const { data: approval, error: apErr } = await supabase
      .from("approvals")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("action_type", "channel.pair")
      .eq("action_ref_id", identity.channel_identity_id)
      .maybeSingle();
    if (apErr) throw apErr;
    expect(approval).toBeTruthy();
    expect(approval.state).toBe("PENDING");
  });

  test("telegram (/connect) -> web confirm pairs when policy auto-approves channel.pair", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["channel.pair"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    // Avoid collisions across repeated runs (Redis anti-replay uses chat_id + message_id).
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    const updateId = 300000 + nonce;
    const messageId = 400000 + nonce;

    const connectRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: "/connect",
        fromId,
        chatId,
        updateId,
        messageId
      })
    });
    await expectStatus(connectRes, 200);
    const connectBody = await connectRes.json();
    const url = connectBody?.reply_markup?.inline_keyboard?.[0]?.[0]?.url || null;
    expect(url).toBeTruthy();

    const match = String(url).match(/[?&]token=([^&]+)/);
    expect(match?.[1]).toBeTruthy();
    const pairToken = decodeURIComponent(match![1]);

    const confirmRes = await request.post("/api/v1/channels/telegram/pair:confirm", {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { pair_token: pairToken }
    });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody?.data?.state).toBe("PAIRED");

    const { data: identity, error: idErr } = await supabase
      .from("channel_identities")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("channel_type", "telegram")
      .eq("channel_user_id", String(fromId))
      .eq("channel_context_id", String(chatId))
      .neq("state", "REVOKED")
      .maybeSingle();
    if (idErr) throw idErr;
    expect(identity).toBeTruthy();
    expect(identity.state).toBe("ACTIVE");

    const { data: tokens, error: tokErr } = await supabase
      .from("pairing_tokens")
      .select("*")
      .eq("token_type", "CHANNEL_TO_WEB")
      .eq("channel_type", "telegram")
      .eq("channel_user_id", String(fromId))
      .eq("channel_context_id", String(chatId))
      .order("created_at", { ascending: false })
      .limit(1);
    if (tokErr) throw tokErr;
    expect(tokens?.length).toBeGreaterThan(0);
    expect(tokens[0].consumed_at).toBeTruthy();
    expect(tokens[0].owner_id).toBe(ownerId);
  });
});
