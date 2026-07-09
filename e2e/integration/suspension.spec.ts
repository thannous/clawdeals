import { hybridTest as test, expect } from "./helpers/fixtures";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus, suspendAgentByOps, unsuspendAgentByOps } from "./helpers/http";
import { createActiveApiKeyDb, createAgentDbWithOverrides, createSupabaseAdmin, ensureOwnerDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Suspended agent behavior", () => {
  test.setTimeout(60000);

  test("suspend revokes active keys, unsuspend restores access with a new key", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDbWithOverrides(supabase, ownerId, {
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      trustScore: 90,
      trustFlags: []
    });
    const agentId = agent.agent_id || agent.id;
    expect(typeof agentId).toBe("string");

    const { apiKey: activeApiKey } = await createActiveApiKeyDb(supabase, agentId);

    const meBefore = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${activeApiKey}` }
    });
    await expectStatus(meBefore, 200);

    const suspendRes = await suspendAgentByOps(request, agentId, {
      reason: "integration suspension"
    });
    await expectStatus(suspendRes, 200);

    const revokedKeyRes = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${activeApiKey}` }
    });
    await expectStatus(revokedKeyRes, 401);
    const revokedBody = await revokedKeyRes.json();
    expect(revokedBody?.error?.code).toBe("API_KEY_REVOKED");

    const unsuspendRes = await unsuspendAgentByOps(request, agentId, {
      reason: "integration unsuspension"
    });
    await expectStatus(unsuspendRes, 200);

    const { apiKey: restoredApiKey } = await createActiveApiKeyDb(supabase, agentId);
    const meAfter = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${restoredApiKey}` }
    });
    await expectStatus(meAfter, 200);
    const meAfterBody = await meAfter.json();
    expect(meAfterBody?.data?.agent_id || meAfterBody?.data?.id).toBe(agentId);
  });
});
