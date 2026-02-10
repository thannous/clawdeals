import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Notifications (TI-300)", () => {
  test.setTimeout(60000);

  test("watchlist match enqueues outbox; notifications-dispatch delivers (dry run)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { ownerId, agent, apiKey } = await setupAgent(supabase);

    const cronSecret = process.env.INTERNAL_CRON_SECRET;
    expect(cronSecret).toBeTruthy();

    const channelUserId = String(Math.floor(Math.random() * 1e12));
    const chatId = String(Math.floor(Math.random() * 1e12));

    const nowIso = new Date().toISOString();
    const { data: channelIdentity, error: ciError } = await supabase
      .from("channel_identities")
      .insert({
        channel_type: "telegram",
        channel_user_id: channelUserId,
        channel_context_id: chatId,
        display_name: "integration-telegram",
        owner_id: ownerId,
        role: "owner",
        state: "ACTIVE",
        approved_at: nowIso,
        approved_by_human_id: ownerId,
        created_at: nowIso
      })
      .select()
      .single();
    expect(ciError).toBeNull();
    expect(channelIdentity?.channel_identity_id).toBeTruthy();

    const { error: prefsError } = await supabase.from("notification_preferences").insert({
      owner_id: ownerId,
      channel_type: "telegram",
      channel_identity_id: channelIdentity.channel_identity_id,
      mode: "DIGEST_HOURLY",
      timezone: "UTC",
      quiet_enabled: false,
      event_types: ["watchlist_match"],
      filters: {},
      daily_digest_hour: 9,
      updated_at: nowIso
    });
    expect(prefsError).toBeNull();

    const wlRes = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        name: "Notif WL",
        criteria: { tags: ["notif-ti-300"] },
        active: true
      }
    });
    await expectStatus(wlRes, 201);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Notif Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 99.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["notif-ti-300"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody?.deal?.deal_id;
    expect(dealId).toBeTruthy();

    // Ensure watchlist matching ran and enqueued an outbox row for the owner.
    const { data: outboxBefore, error: outboxBeforeError } = await supabase
      .from("notification_outbox")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("event_type", "watchlist_match")
      .eq("entity_type", "deal")
      .eq("entity_id", dealId)
      .maybeSingle();
    expect(outboxBeforeError).toBeNull();
    expect(outboxBefore?.status).toBe("PENDING");

    // Dispatch selects the oldest pending outbox rows and limits by distinct owners.
    // On shared test DBs, there can be many older pending rows, so force our row to be oldest.
    const { error: bumpErr } = await supabase
      .from("notification_outbox")
      .update({ occurred_at: "2000-01-01T00:00:00.000Z" })
      .eq("notification_outbox_id", outboxBefore.notification_outbox_id);
    expect(bumpErr).toBeNull();

    const cronRes = await request.post("/api/internal/cron/notifications-dispatch?dry_run=1&limit_owners=20", {
      headers: { "x-cron-secret": String(cronSecret) }
    });
    await expectStatus(cronRes, 200);

    const { data: outboxAfter, error: outboxAfterError } = await supabase
      .from("notification_outbox")
      .select("*")
      .eq("notification_outbox_id", outboxBefore.notification_outbox_id)
      .single();
    expect(outboxAfterError).toBeNull();
    expect(outboxAfter?.status).toBe("DELIVERED");
    expect(outboxAfter?.delivered_at).toBeTruthy();

    // Also ensure the agent is correct (sanity that setupAgent owner is used).
    expect(agent.owner_id).toBe(ownerId);
  });
});
