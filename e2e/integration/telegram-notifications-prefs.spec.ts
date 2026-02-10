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

test.describe.serial("Integration: Telegram notifications prefs (TI-300)", () => {
  test.setTimeout(60000);

  test("/notif callbacks update notification_preferences in DB", async ({ request }) => {
    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");

    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 130000 + nonce;
    const chatId = 230000 + nonce;

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

    const openRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/notif",
        fromId,
        chatId,
        updateId: 330000 + nonce,
        messageId: 430000 + nonce
      })
    });
    await expectStatus(openRes, 200);
    const openBody = await openRes.json();
    expect(openBody?.method).toBe("sendMessage");
    expect(openBody?.reply_markup?.inline_keyboard?.length).toBeGreaterThan(0);
    expect(String(openBody?.text || "")).toMatch(/Notifications settings/);

    const silentCb = findCallbackData(openBody.reply_markup, "Silent");
    expect(silentCb).toBeTruthy();

    const silentRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: silentCb,
        fromId,
        chatId,
        updateId: 330001 + nonce,
        messageId: 430000 + nonce,
        callbackQueryId: `cb-silent-${nonce}`
      })
    });
    await expectStatus(silentRes, 200);
    const silentBody = await silentRes.json();
    expect(silentBody?.method).toBe("editMessageText");
    expect(String(silentBody?.text || "")).toMatch(/mode:\s*SILENT/);

    const offersToggleCb = findCallbackData(silentBody.reply_markup, "Offers:OFF") || findCallbackData(silentBody.reply_markup, "Offers:ON");
    expect(offersToggleCb).toBeTruthy();

    const offersRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: offersToggleCb,
        fromId,
        chatId,
        updateId: 330002 + nonce,
        messageId: 430000 + nonce,
        callbackQueryId: `cb-offers-${nonce}`
      })
    });
    await expectStatus(offersRes, 200);
    const offersBody = await offersRes.json();
    expect(offersBody?.method).toBe("editMessageText");

    const quiet22Cb = findCallbackData(offersBody.reply_markup, "22-08");
    expect(quiet22Cb).toBeTruthy();

    const quietRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: quiet22Cb,
        fromId,
        chatId,
        updateId: 330003 + nonce,
        messageId: 430000 + nonce,
        callbackQueryId: `cb-quiet-${nonce}`
      })
    });
    await expectStatus(quietRes, 200);
    const quietBody = await quietRes.json();
    expect(quietBody?.method).toBe("editMessageText");
    expect(String(quietBody?.text || "")).toMatch(/quiet hours:\s*ON/);

    const { data: prefs, error: prefsErr } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("channel_identity_id", identity.channel_identity_id)
      .maybeSingle();
    if (prefsErr) throw prefsErr;
    expect(prefs).toBeTruthy();
    expect(prefs.mode).toBe("SILENT");
    expect(prefs.quiet_enabled).toBe(true);
    expect(prefs.quiet_start_min).toBe(22 * 60);
    expect(prefs.quiet_end_min).toBe(8 * 60);
    expect(Array.isArray(prefs.event_types)).toBe(true);
  });
});

