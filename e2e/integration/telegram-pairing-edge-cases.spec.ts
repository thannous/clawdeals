import crypto from "node:crypto";
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

function requirePairTokenSecret() {
  const secret = process.env.PAIR_TOKEN_SECRET || process.env.PAIRING_CODE_SECRET;
  if (!secret) throw new Error("Missing env var: PAIR_TOKEN_SECRET (or PAIRING_CODE_SECRET)");
  return secret;
}

function hashPairToken(token: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(String(token)).digest("hex");
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

test.describe.serial("Integration: Telegram pairing edge cases (TI-296)", () => {
  test.setTimeout(60000);

  test("/start token reuse returns PAIR_TOKEN_USED", async ({ request }) => {
    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");

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

    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;

    const first = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: `/start ${pairToken}`,
        fromId,
        chatId,
        updateId: 300000 + nonce,
        messageId: 400000 + nonce
      })
    });
    await expectStatus(first, 200);
    const firstBody = await first.json();
    expect(firstBody?.method).toBe("sendMessage");

    const second = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: `/start ${pairToken}`,
        fromId,
        chatId,
        updateId: 300001 + nonce,
        messageId: 400001 + nonce // avoid Redis anti-replay collisions
      })
    });
    await expectStatus(second, 200);
    const secondBody = await second.json();
    expect(secondBody?.method).toBe("sendMessage");
    expect(String(secondBody?.text || "")).toMatch(/^PAIR_TOKEN_USED/);
  });

  test("/start expired token returns PAIR_TOKEN_EXPIRED", async ({ request }) => {
    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    const pairTokenSecret = requirePairTokenSecret();

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

    // Force-expire the token in DB (so we test the real server path).
    const tokenHash = hashPairToken(String(pairToken), pairTokenSecret);
    const expiredAt = new Date(Date.now() - 60 * 1000).toISOString();
    const { error: updErr } = await supabase
      .from("pairing_tokens")
      .update({ expires_at: expiredAt })
      .eq("token_hash", tokenHash)
      .eq("token_type", "WEB_TO_CHANNEL");
    if (updErr) throw updErr;

    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 110000 + nonce;
    const chatId = 210000 + nonce;

    const res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: `/start ${pairToken}`,
        fromId,
        chatId,
        updateId: 310000 + nonce,
        messageId: 410000 + nonce
      })
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body?.method).toBe("sendMessage");
    expect(String(body?.text || "")).toMatch(/^PAIR_TOKEN_EXPIRED/);
  });

  test("pairing an already-paired Telegram account returns CHANNEL_ALREADY_PAIRED", async ({ request }) => {
    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");

    const supabase = createSupabaseAdmin();
    const ownerA = randomId();
    const ownerB = randomId();
    await ensureOwnerDb(supabase, ownerA);
    await ensureOwnerDb(supabase, ownerB);

    // Ensure ownerA auto-approves channel pairing so the identity becomes ACTIVE.
    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerA },
      data: {
        budgets: { max_offer: 10_000, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 10_000, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["channel.pair"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const startA = await request.post("/api/v1/channels/telegram/pair:start", {
      headers: { "x-owner-id": ownerA, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(startA, 201);
    const tokenA = (await startA.json())?.data?.pair_token;
    expect(tokenA).toBeTruthy();

    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 120000 + nonce;
    const chatId = 220000 + nonce;

    const pairA = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: `/start ${tokenA}`,
        fromId,
        chatId,
        updateId: 320000 + nonce,
        messageId: 420000 + nonce
      })
    });
    await expectStatus(pairA, 200);

    const startB = await request.post("/api/v1/channels/telegram/pair:start", {
      headers: { "x-owner-id": ownerB, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(startB, 201);
    const tokenB = (await startB.json())?.data?.pair_token;
    expect(tokenB).toBeTruthy();

    const pairB = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramUpdate({
        text: `/start ${tokenB}`,
        fromId,
        chatId,
        updateId: 320001 + nonce,
        messageId: 420001 + nonce
      })
    });
    await expectStatus(pairB, 200);
    const bodyB = await pairB.json();
    expect(bodyB?.method).toBe("sendMessage");
    expect(String(bodyB?.text || "")).toMatch(/^CHANNEL_ALREADY_PAIRED/);
  });
});

