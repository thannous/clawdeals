import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, ensureOpsConsoleAgent } from "./helpers/supabase";

assertIntegrationEnv();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
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

test.describe.serial("Integration: Telegram attachments (TI-301)", () => {
  test.setTimeout(60000);

  test("location update creates/updates a draft listing and stores active_listing_draft_id", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const { error: colErr } = await supabase.from("channel_identities").select("active_listing_draft_id").limit(1);
    if (colErr && /active_listing_draft_id/i.test(colErr.message || "")) {
      test.skip(true, "Supabase DB not migrated for TI-301 (missing channel_identities.active_listing_draft_id)");
      return;
    }

    const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN");
    const nonce = Math.floor(Math.random() * 1_000_000_000);
    const fromId = 100000 + nonce;
    const chatId = 200000 + nonce;
    const updateId = 300000 + nonce;
    const messageId = 400000 + nonce;

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
        created_at: nowIso,
        approved_at: nowIso,
        last_seen_at: nowIso
      })
      .select("*")
      .single();
    if (idErr) throw idErr;
    expect(identity).toBeTruthy();

    const webhookRes = await request.post("/api/v1/channels/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": webhookSecret },
      data: makeTelegramLocationUpdate({
        fromId,
        chatId,
        updateId,
        messageId,
        lat: 48.8566,
        lng: 2.3522
      })
    });
    await expectStatus(webhookRes, 200);
    const webhookBody = await webhookRes.json();
    expect(webhookBody?.method).toBe("sendMessage");
    expect(String(webhookBody?.text || "")).toMatch(/Status:\s*DRAFT/);

    const { data: updatedIdentity, error: updatedErr } = await supabase
      .from("channel_identities")
      .select("channel_identity_id,active_listing_draft_id,active_listing_draft_updated_at")
      .eq("channel_identity_id", identity.channel_identity_id)
      .single();
    if (updatedErr) throw updatedErr;
    expect(updatedIdentity.active_listing_draft_id).toBeTruthy();

    const listingId = updatedIdentity.active_listing_draft_id;
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("listing_id,status,geo_lat,geo_lng")
      .eq("listing_id", listingId)
      .single();
    if (listingErr) throw listingErr;
    expect(listing.status).toBe("DRAFT");
    expect(Number(listing.geo_lat)).toBeCloseTo(48.8566, 4);
    expect(Number(listing.geo_lng)).toBeCloseTo(2.3522, 4);
  });
});
