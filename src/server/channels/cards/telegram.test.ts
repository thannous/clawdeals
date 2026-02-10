import { describe, expect, it } from "vitest";

import { decodeTelegramCardCallbackData, encodeTelegramCardCallbackData, renderCardToTelegram } from "./telegram";

describe("cards/telegram", () => {
  it("encodes callback_data stably regardless of args insertion order", () => {
    const a = encodeTelegramCardCallbackData({
      commandId: "menu.watchlists",
      actionId: "home.watchlists",
      args: { b: 2, a: 1 }
    });
    const b = encodeTelegramCardCallbackData({
      commandId: "menu.watchlists",
      actionId: "home.watchlists",
      args: { a: 1, b: 2 }
    });
    expect(a).toBe(b);
    expect(decodeTelegramCardCallbackData(a)).toEqual({
      commandId: "menu.watchlists",
      actionId: "home.watchlists",
      args: { a: "1", b: "2" }
    });
  });

  it("encodes and decodes callback_data (with action_id + args)", () => {
    const encoded = encodeTelegramCardCallbackData({
      commandId: "menu.watchlists",
      actionId: "home.watchlists",
      args: { p: 2, q: "hello world" }
    });
    expect(encoded.startsWith("cd:")).toBe(true);
    expect(encoded.length).toBeLessThanOrEqual(64);

    const decoded = decodeTelegramCardCallbackData(encoded);
    expect(decoded).toEqual({
      commandId: "menu.watchlists",
      actionId: "home.watchlists",
      args: { p: "2", q: "hello world" }
    });
  });

  it("supports args without action_id (compact form)", () => {
    const encoded = encodeTelegramCardCallbackData({
      commandId: "menu.watchlists",
      args: { p: 1 }
    });
    const decoded = decodeTelegramCardCallbackData(encoded);
    expect(decoded).toEqual({ commandId: "menu.watchlists", actionId: null, args: { p: "1" } });
  });

  it("renders a Telegram inline keyboard grouped by row", () => {
    const rendered = renderCardToTelegram({
      title: "Menu",
      bullets: ["A", "B"],
      actions: [
        { action_id: "a1", label: "Left", command_id: "x.left", row: 0 },
        { action_id: "a2", label: "Right", command_id: "x.right", row: 0 },
        { action_id: "a3", label: "Next", command_id: "x.next", row: 1 }
      ]
    });

    expect(rendered.text).toContain("Menu");
    expect(rendered.replyMarkup.inline_keyboard).toHaveLength(2);
    expect(rendered.replyMarkup.inline_keyboard[0]).toHaveLength(2);
    expect(rendered.replyMarkup.inline_keyboard[1]).toHaveLength(1);
    expect(rendered.replyMarkup.inline_keyboard[0][0].callback_data).toMatch(/^cd:/);
  });
});
