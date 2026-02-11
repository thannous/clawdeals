import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { createSupabaseAdmin } from "./helpers/supabase";
import { randomId } from "./helpers/ids";

assertIntegrationEnv();

test.describe.serial("Integration: Telegram revoked enforcement", () => {
  test.setTimeout(60000);

  test("revoked identity triggers CHANNEL_NOT_PAIRED response", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();

    await supabase.from("owners").upsert({
      owner_id: ownerId,
      updated_at: new Date().toISOString()
    });

    const insert = await supabase
      .from("channel_identities")
      .insert({
        channel_type: "telegram",
        channel_user_id: `revoked_${ownerId.slice(0, 8)}`,
        channel_context_id: "",
        display_name: "revoked-user",
        owner_id: ownerId,
        role: "owner",
        state: "REVOKED",
        revoked_at: new Date().toISOString()
      })
      .select()
      .single();
    if (insert.error) throw insert.error;

    process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "token";
    process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || "secret";

    const payload = {
      update_id: 10001,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: "private" },
        text: "status",
        from: { id: 123, is_bot: false, first_name: "Revoked" }
      }
    };

    const res = await request.post("/api/v1/channels/telegram/webhook", {
      headers: {
        "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || "secret",
        "x-telegram-bot-token": process.env.TELEGRAM_BOT_TOKEN || "token"
      },
      data: payload
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body?.text).toMatch(/CHANNEL_NOT_PAIRED/);
  });
});
