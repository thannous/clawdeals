import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, setupAgent } from "./helpers/supabase";

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

function makeTelegramCallbackUpdate({ data, fromId, chatId, updateId, messageId, callbackQueryId }: any) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    update_id: updateId,
    callback_query: {
      id: callbackQueryId || `cb-${updateId}`,
      from: { id: fromId, username: "itest" },
      data,
      message: {
        message_id: messageId,
        date: nowSec,
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

test.describe.serial("Integration: Telegram menu navigation (TI-297)", () => {
  test.setTimeout(60000);

  test("/menu -> Watchlists (pagination) -> Back", async ({ request }) => {
    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");

    const supabase = createSupabaseAdmin();
    const { ownerId, apiKey } = await setupAgent(supabase);

    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;

    const nowIso = new Date().toISOString();
    const { data: identity, error: idErr } = await supabase
      .from("channel_identities")
      .insert({
        channel_type: "telegram",
        channel_user_id: String(fromId),
        channel_context_id: String(chatId),
        display_name: "itest",
        owner_id: ownerId,
        role: "owner",
        state: "ACTIVE",
        approved_at: nowIso,
        approved_by_human_id: ownerId,
        created_at: nowIso,
        last_seen_at: nowIso
      })
      .select("*")
      .single();
    if (idErr) throw idErr;
    expect(identity?.channel_identity_id).toBeTruthy();

    // Create enough watchlists to trigger pagination (page size = 8).
    for (let i = 0; i < 9; i += 1) {
      const wlRes = await request.post("/api/v1/watchlists", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          name: `TG WL ${i}`,
          criteria: { tags: [`tg-menu-nav-${i}`] },
          active: true
        }
      });
      await expectStatus(wlRes, 201);
    }

    const menuRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/menu",
        fromId,
        chatId,
        updateId: 300000 + nonce,
        messageId: 400000 + nonce
      })
    });
    await expectStatus(menuRes, 200);
    const menuBody = await menuRes.json();
    expect(menuBody?.method).toBe("sendMessage");
    expect(menuBody?.reply_markup?.inline_keyboard?.length).toBe(7);
    expect(menuBody?.reply_markup?.inline_keyboard?.[0]?.[0]?.text).toBe("Watchlists");
    expect(menuBody?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe("cd:menu.watchlists:home.watchlists:p=0");

    const watchlistsCb = findCallbackData(menuBody.reply_markup, "Watchlists");
    expect(watchlistsCb).toBeTruthy();

    const openWatchlistsRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: watchlistsCb,
        fromId,
        chatId,
        updateId: 300001 + nonce,
        messageId: 400000 + nonce, // edit the menu message
        callbackQueryId: `cb-open-${nonce}`
      })
    });
    await expectStatus(openWatchlistsRes, 200);
    const wl1 = await openWatchlistsRes.json();
    expect(wl1?.method).toBe("editMessageText");
    expect(String(wl1?.text || "")).toMatch(/\bWatchlists\b/);
    expect(String(wl1?.text || "")).toMatch(/\bPage 1\b/);

    const nextCb = findCallbackData(wl1.reply_markup, "Suiv");
    expect(nextCb).toBeTruthy();

    const openPage2Res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: nextCb,
        fromId,
        chatId,
        updateId: 300002 + nonce,
        messageId: 400000 + nonce,
        callbackQueryId: `cb-next-${nonce}`
      })
    });
    await expectStatus(openPage2Res, 200);
    const wl2 = await openPage2Res.json();
    expect(wl2?.method).toBe("editMessageText");
    expect(String(wl2?.text || "")).toMatch(/\bWatchlists\b/);
    expect(String(wl2?.text || "")).toMatch(/\bPage 2\b/);
    expect(findCallbackData(wl2.reply_markup, "Prec")).toBeTruthy();

    const backCb = findCallbackData(wl2.reply_markup, "Retour");
    expect(backCb).toBeTruthy();

    const backRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: backCb,
        fromId,
        chatId,
        updateId: 300003 + nonce,
        messageId: 400000 + nonce,
        callbackQueryId: `cb-back-${nonce}`
      })
    });
    await expectStatus(backRes, 200);
    const home = await backRes.json();
    expect(home?.method).toBe("editMessageText");
    expect(String(home?.text || "")).toMatch(/^Clawdeals/);
    expect(String(home?.text || "")).toMatch(/\bMenu\b/);
  });
});

