import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Owner Login + Identities", () => {
  test.setTimeout(60000);

  test("owner login via email token and revoke telegram identity", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const seed = randomId();
    const email = `itest+login+${seed.slice(0, 8)}@example.com`;

    const start = await request.post("/api/v1/auth/login:start", {
      data: { email }
    });
    await expectStatus(start, 201);
    const startBody = await start.json();
    const ownerId = startBody?.data?.owner_id as string;
    const sessionId = startBody?.data?.session_id as string;
    const token = startBody?.data?.session_token as string;

    expect(ownerId).toBeTruthy();
    expect(sessionId).toBeTruthy();
    expect(token).toBeTruthy();

    const confirm = await request.post("/api/v1/auth/login:confirm", {
      data: { session_id: sessionId, token }
    });
    await expectStatus(confirm, 200);

    const me = await request.get("/api/v1/auth/me");
    await expectStatus(me, 200);
    const meBody = await me.json();
    expect(meBody?.data?.owner_id).toBe(ownerId);
    expect(meBody?.data?.email).toBe(email.toLowerCase());

    const channelRow = {
      channel_type: "telegram",
      channel_user_id: `tg_${ownerId.slice(0, 8)}`,
      channel_context_id: "",
      display_name: "itest",
      owner_id: ownerId,
      role: "owner",
      state: "ACTIVE",
      approved_by_human_id: ownerId,
      approved_at: new Date().toISOString()
    } as const;

    const { data: inserted, error } = await supabase.from("channel_identities").insert(channelRow).select().single();
    if (error) throw error;
    const channelIdentityId = inserted.channel_identity_id as string;

    const list = await request.get("/api/v1/owner/identities?limit=5");
    await expectStatus(list, 200);
    const listBody = await list.json();
    const channels = listBody?.data?.channels || [];
    expect(channels.some((row: any) => row.identity_id === channelIdentityId)).toBe(true);

    const revoke = await request.delete(`/api/v1/owner/identities/${encodeURIComponent(channelIdentityId)}`, {
      headers: { "Idempotency-Key": randomId() }
    });
    await expectStatus(revoke, 200);
    const revokeBody = await revoke.json();
    expect(revokeBody?.data?.state).toBe("REVOKED");

    const updated = await supabase
      .from("channel_identities")
      .select("state, revoked_at")
      .eq("channel_identity_id", channelIdentityId)
      .maybeSingle();
    if (updated.error) throw updated.error;
    expect(updated.data?.state).toBe("REVOKED");
    expect(updated.data?.revoked_at).toBeTruthy();
  });
});
