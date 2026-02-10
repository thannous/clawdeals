import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { expectStatus } from "./helpers/http";

assertIntegrationEnv();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function makeTelegramTextUpdate({ text, fromId, chatId, chatType, updateId, messageId }: any) {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      text,
      from: { id: fromId, username: "itest" },
      chat: { id: chatId, type: chatType || "private" }
    }
  };
}

function makeTelegramCallbackUpdate({ data, fromId, chatId, chatType, updateId, messageId, callbackQueryId }: any) {
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
        chat: { id: chatId, type: chatType || "private" }
      }
    }
  };
}

test.describe.serial("Integration: Telegram webhook security (TI-302)", () => {
  test.setTimeout(60000);

  test("rejects missing secret token header (401)", async ({ request }) => {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    if (!expected) test.skip(true, "Missing TELEGRAM_WEBHOOK_SECRET_TOKEN for Telegram integration specs");

    const res = await request.post("/api/v1/channels/telegram/webhook", {
      data: makeTelegramTextUpdate({
        text: "help",
        fromId: 100001,
        chatId: 200001,
        updateId: 300001,
        messageId: 400001
      })
    });
    await expectStatus(res, 401);
    const body = await res.json();
    expect(body?.error?.code).toBe("UNAUTHORIZED");
  });

  test("rejects invalid secret token header (401)", async ({ request }) => {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    if (!expected) test.skip(true, "Missing TELEGRAM_WEBHOOK_SECRET_TOKEN for Telegram integration specs");

    const res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "wrong" },
      data: makeTelegramTextUpdate({
        text: "help",
        fromId: 100002,
        chatId: 200002,
        updateId: 300002,
        messageId: 400002
      })
    });
    await expectStatus(res, 401);
    const body = await res.json();
    expect(body?.error?.code).toBe("UNAUTHORIZED");
  });

  test("blocks non-private chats (200 {ok:true})", async ({ request }) => {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    if (!webhookSecret) test.skip(true, "Missing TELEGRAM_WEBHOOK_SECRET_TOKEN for Telegram integration specs");

    const res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "status",
        fromId: 100003,
        chatId: 200003,
        chatType: "group",
        updateId: 300003,
        messageId: 400003
      })
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  test("dedupes callback query replays (Already handled)", async ({ request }) => {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    if (!webhookSecret) test.skip(true, "Missing TELEGRAM_WEBHOOK_SECRET_TOKEN for Telegram integration specs");

    const fromId = 100004;
    const chatId = 200004;
    const callbackQueryId = `cb-${Math.floor(Math.random() * 1_000_000_000)}`;

    const reqBody = makeTelegramCallbackUpdate({
      data: "help",
      fromId,
      chatId,
      updateId: 300004,
      messageId: 400004,
      callbackQueryId
    });

    const firstRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: reqBody
    });
    await expectStatus(firstRes, 200);
    const first = await firstRes.json();
    expect(first?.method).toBe("editMessageText");

    const secondRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: reqBody
    });
    await expectStatus(secondRes, 200);
    const second = await secondRes.json();
    expect(second?.method).toBe("answerCallbackQuery");
    expect(second?.text).toBe("Already handled");
  });

  test("enforces TELEGRAM_WEBHOOK_PATH_SECRET when configured", async ({ request }) => {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    if (!webhookSecret) test.skip(true, "Missing TELEGRAM_WEBHOOK_SECRET_TOKEN for Telegram integration specs");

    const pathSecret = process.env.TELEGRAM_WEBHOOK_PATH_SECRET;
    if (!pathSecret) test.skip(true, "TELEGRAM_WEBHOOK_PATH_SECRET not configured for this environment");

    const okRes = await request.post(`/api/v1/channels/telegram/webhook/${encodeURIComponent(pathSecret)}`, {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "help",
        fromId: 100005,
        chatId: 200005,
        updateId: 300005,
        messageId: 400005
      })
    });
    await expectStatus(okRes, 200);

    const badRes = await request.post(`/api/v1/channels/telegram/webhook/wrong`, {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramTextUpdate({
        text: "help",
        fromId: 100006,
        chatId: 200006,
        updateId: 300006,
        messageId: 400006
      })
    });
    await expectStatus(badRes, 404);
    const badBody = await badRes.json();
    expect(badBody?.error?.code).toBe("NOT_FOUND");
  });
});

