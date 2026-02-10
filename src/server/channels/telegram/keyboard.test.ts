import { describe, expect, it } from "vitest";

import { buildNotificationsKeyboard } from "./keyboard";

describe("telegram/keyboard", () => {
  it("renders stable callback_data for the notifications menu (mode + quiet + types)", () => {
    const kb = buildNotificationsKeyboard({
      mode: "DIGEST_HOURLY",
      quiet_enabled: false,
      event_types: ["watchlist_match"]
    });

    expect(Array.isArray(kb.inline_keyboard)).toBe(true);
    expect(kb.inline_keyboard).toHaveLength(4);

    const modeRow = kb.inline_keyboard[0];
    expect(modeRow.map((b: any) => b.callback_data)).toEqual([
      "cd:notifications.mode:m=realtime",
      "cd:notifications.mode:m=digest_hourly",
      "cd:notifications.mode:m=digest_daily",
      "cd:notifications.mode:m=silent"
    ]);

    const quietRow = kb.inline_keyboard[1];
    expect(quietRow.map((b: any) => b.callback_data)).toEqual([
      "cd:notifications.quiet.set:e=08%3A00&s=22%3A00",
      "cd:notifications.quiet.set:e=08%3A00&s=22%3A00",
      "cd:notifications.quiet.set:e=07%3A00&s=23%3A00"
    ]);

    const typesRowA = kb.inline_keyboard[2];
    const typesRowB = kb.inline_keyboard[3];
    expect([...typesRowA, ...typesRowB].map((b: any) => b.callback_data)).toEqual([
      "cd:notifications.types.toggle:t=watchlist_match",
      "cd:notifications.types.toggle:t=offer_received",
      "cd:notifications.types.toggle:t=approval_required",
      "cd:notifications.types.toggle:t=transaction_updates"
    ]);
  });

  it("uses a stable quiet toggle callback when quiet is enabled", () => {
    const kb = buildNotificationsKeyboard({
      mode: "REALTIME",
      quiet_enabled: true,
      event_types: ["watchlist_match"]
    });

    const quietRow = kb.inline_keyboard[1];
    expect(quietRow[0].callback_data).toBe("cd:notifications.quiet.off");
  });
});
