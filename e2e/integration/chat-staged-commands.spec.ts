import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus, createListing } from "./helpers/http";
import { createSupabaseAdmin, setupAgent, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Chat staged commands (TI-298)", () => {
  test.setTimeout(60000);

  test("stage -> confirm is idempotent (watchlist.create)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey, agent } = await setupAgent(supabase);

    const stageRes = await request.post("/api/v1/chat/commands:stage", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        action_type: "watchlist.create",
        payload: { name: "Staged WL", criteria: { tags: ["ti-298-staged"] }, active: true }
      }
    });
    await expectStatus(stageRes, 201);
    const stageBody = await stageRes.json();
    const commandId = stageBody?.command_id;
    expect(typeof commandId).toBe("string");

    const { data: stagedRow, error: stagedErr } = await supabase
      .from("staged_commands")
      .select("*")
      .eq("command_id", commandId)
      .single();
    if (stagedErr) throw stagedErr;
    expect(stagedRow.state).toBe("STAGED");

    const confirmRes = await request.post(`/api/v1/chat/commands/${encodeURIComponent(commandId)}:confirm`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": String(commandId) },
      data: {}
    });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody?.state).toBe("EXECUTED");

    const { data: watchlists, error: wlErr } = await supabase
      .from("watchlists")
      .select("watchlist_id")
      .eq("agent_id", agent.id);
    if (wlErr) throw wlErr;
    expect((watchlists || []).length).toBe(1);

    // Idempotent confirm should not create another row.
    const confirmAgain = await request.post(`/api/v1/chat/commands/${encodeURIComponent(commandId)}:confirm`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": String(commandId) },
      data: {}
    });
    await expectStatus(confirmAgain, 200);

    const { data: watchlistsAfter, error: wlErr2 } = await supabase
      .from("watchlists")
      .select("watchlist_id")
      .eq("agent_id", agent.id);
    if (wlErr2) throw wlErr2;
    expect((watchlistsAfter || []).length).toBe(1);
  });

  test("stage -> cancel transitions to CANCELLED", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const stageRes = await request.post("/api/v1/chat/commands:stage", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        action_type: "watchlist.create",
        payload: { name: "Cancel WL", criteria: { tags: ["ti-298-cancel"] }, active: true }
      }
    });
    await expectStatus(stageRes, 201);
    const commandId = (await stageRes.json())?.command_id;
    expect(typeof commandId).toBe("string");

    const cancelRes = await request.post(`/api/v1/chat/commands/${encodeURIComponent(commandId)}:cancel`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": String(commandId) },
      data: {}
    });
    await expectStatus(cancelRes, 200);
    const cancelBody = await cancelRes.json();
    expect(cancelBody?.state).toBe("CANCELLED");
  });

  test("confirm -> undo cancels the offer within window (offer.create)", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    // Seller
    const seller = await setupAgent(supabase);
    // Buyer (separate owner)
    const buyerOwnerId = randomId();
    await supabase.from("owners").upsert({ owner_id: buyerOwnerId, updated_at: new Date().toISOString() });
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { name: "Buyer Agent" });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, seller.apiKey, { title: `TI-298 undo ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingId = (await listingRes.json())?.listing_id;
    expect(typeof listingId).toBe("string");

    const stageRes = await request.post("/api/v1/chat/commands:stage", {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {
        action_type: "offer.create",
        payload: {
          listing_id: listingId,
          thread_id: null,
          amount: 10,
          currency: "EUR",
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      }
    });
    await expectStatus(stageRes, 201);
    const stageBody = await stageRes.json();
    const commandId = stageBody?.command_id;
    expect(typeof commandId).toBe("string");

    const confirmRes = await request.post(`/api/v1/chat/commands/${encodeURIComponent(commandId)}:confirm`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": String(commandId) },
      data: {}
    });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody?.state).toBe("EXECUTED");
    expect(confirmBody?.result_ref?.type).toBe("offer");
    expect(typeof confirmBody?.result_ref?.id).toBe("string");
    expect(confirmBody?.undo?.supported).toBe(true);
    expect(confirmBody?.undo?.state).toBe("AVAILABLE");

    const undoRes = await request.post(`/api/v1/chat/commands/${encodeURIComponent(commandId)}:undo`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": String(commandId) },
      data: {}
    });
    await expectStatus(undoRes, 200);
    const undoBody = await undoRes.json();
    expect(undoBody?.state).toBe("EXECUTED");
    expect(undoBody?.undo?.state).toBe("UNDONE");
  });
});

