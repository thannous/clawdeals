import { describe, expect, it } from "vitest";

import { buildTelegramSendMessage } from "./format";

describe("Telegram formatter", () => {
  it("preserves newlines while stripping other ASCII control chars", () => {
    const msg = buildTelegramSendMessage({
      chatId: "chat-1",
      text: ["first", "second\r", "third\u0001"].join("\n")
    });

    // Keeps \n and \r, strips \u0001.
    expect(msg.text).toBe("first\nsecond\r\nthird");
  });

  it("passes reply_markup through when provided", () => {
    const msg = buildTelegramSendMessage({
      chatId: "chat-1",
      text: "hi",
      replyMarkup: {
        inline_keyboard: [[{ text: "Open", url: "https://app.clawdeals.com/pair?token=x" }]]
      }
    });

    expect(msg.reply_markup).toEqual({
      inline_keyboard: [[{ text: "Open", url: "https://app.clawdeals.com/pair?token=x" }]]
    });
  });
});
