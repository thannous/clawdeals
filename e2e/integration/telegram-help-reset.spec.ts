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

function makeTelegramLocationUpdate({ fromId, chatId, updateId, messageId, lat, lng }: any) {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      from: { id: fromId, username: "itest" },
      chat: { id: chatId, type: "private" },
      location: { latitude: lat, longitude: lng }
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

test.describe.serial("Integration: Telegram help/reset (TI-303)", () => {
  test.setTimeout(60000);

  test("/help renders buttons; Reset clears draft + cancels staged commands for channel", async ({ request }) => {
    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");

    const supabase = createSupabaseAdmin();
    const { ownerId, apiKey } = await setupAgent(supabase);

    const { error: colErr } = await supabase.from("channel_identities").select("active_listing_draft_id").limit(1);
    if (colErr && /active_listing_draft_id/i.test(colErr.message || "")) {
      test.skip(true, "Supabase DB not migrated for TI-301 (missing channel_identities.active_listing_draft_id)");
      return;
    }

    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 140000 + nonce;
    const chatId = 240000 + nonce;

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

    // Create a draft listing pointer via a location update.
    const locRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramLocationUpdate({
        fromId,
        chatId,
        updateId: 340000 + nonce,
        messageId: 440000 + nonce,
        lat: 48.8566,
        lng: 2.3522
      })
    });
    await expectStatus(locRes, 200);

    const { data: updatedIdentity, error: updatedErr } = await supabase
      .from("channel_identities")
      .select("channel_identity_id,active_listing_draft_id")
      .eq("channel_identity_id", identity.channel_identity_id)
      .single();
    if (updatedErr) throw updatedErr;
    expect(updatedIdentity.active_listing_draft_id).toBeTruthy();

    // Create a staged command tied to this channel identity.
    const stageRes = await request.post("/api/v1/chat/commands:stage", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        action_type: "watchlist.create",
        origin_context: { kind: "control_dm" },
        channel_identity_id: identity.channel_identity_id,
        payload: { name: "Reset WL", criteria: { tags: ["ti-303-reset"] }, active: true }
      }
    });
    await expectStatus(stageRes, 201);
    const stageBody = await stageRes.json();
    const commandId = stageBody?.command_id;
    expect(typeof commandId).toBe("string");

    const helpRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "/help",
        fromId,
        chatId,
        updateId: 340001 + nonce,
        messageId: 440001 + nonce
      })
    });
    await expectStatus(helpRes, 200);
    const helpBody = await helpRes.json();
    expect(helpBody?.method).toBe("sendMessage");
    expect(helpBody?.reply_markup?.inline_keyboard?.length).toBeGreaterThan(0);

    const resetCb = findCallbackData(helpBody.reply_markup, "Reset");
    expect(resetCb).toBeTruthy();

    const resetRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramCallbackUpdate({
        data: resetCb,
        fromId,
        chatId,
        updateId: 340002 + nonce,
        messageId: 440001 + nonce,
        callbackQueryId: `cb-reset-${nonce}`
      })
    });
    await expectStatus(resetRes, 200);
    const resetBody = await resetRes.json();
    expect(resetBody?.method).toBe("editMessageText");
    expect(String(resetBody?.text || "")).toMatch(/^Reset/);

    const { data: afterIdentity, error: afterErr } = await supabase
      .from("channel_identities")
      .select("channel_identity_id,active_listing_draft_id")
      .eq("channel_identity_id", identity.channel_identity_id)
      .single();
    if (afterErr) throw afterErr;
    expect(afterIdentity.active_listing_draft_id).toBeNull();

    const { data: stagedAfter, error: stagedAfterErr } = await supabase
      .from("staged_commands")
      .select("command_id,state")
      .eq("command_id", commandId)
      .maybeSingle();
    if (stagedAfterErr) throw stagedAfterErr;
    expect(stagedAfter?.state).toBe("CANCELLED");
  });
});
