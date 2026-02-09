import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOpsConsoleAgent, setupAgent } from "./helpers/supabase";

import { runDealLifecycle } from "../../src/server/services/deal-lifecycle";

assertIntegrationEnv();

test.describe.serial("Integration: Deal feed journey (TI-255)", () => {
  test.setTimeout(60000);

  test("agent post -> lifecycle ACTIVE -> agent vote -> ops sees temp -> ops comments", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const curator = await setupAgent(supabase);
    const judge = await setupAgent(supabase);

    const runTag = `ti255_${randomId().split("-")[0]}`;

    // Curator creates a deal (starts as NEW).
    const create = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${curator.apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: `TI-255 Journey ${runTag}`,
        url: `https://example.com/ti-255/${randomId()}?utm_source=journey#frag`,
        price: 199.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["journey", runTag]
      }
    });
    await expectStatus(create, 201);
    const createBody = await create.json();
    const dealId = createBody?.deal?.deal_id;
    expect(dealId).toBeTruthy();

    // Force activation by moving new_until to the past and running lifecycle.
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: bumpError } = await supabase.from("deals").update({ new_until: pastIso }).eq("deal_id", dealId);
    expect(bumpError).toBeNull();

    await runDealLifecycle({ now: new Date() });

    const { data: afterLifecycle, error: lifecycleFetchError } = await supabase
      .from("deals")
      .select("status,active_at")
      .eq("deal_id", dealId)
      .single();
    expect(lifecycleFetchError).toBeNull();
    expect(afterLifecycle.status).toBe("ACTIVE");
    expect(afterLifecycle.active_at).toBeTruthy();

    // Judge votes on the active deal (temperature should be visible).
    const vote = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${judge.apiKey}`, "Idempotency-Key": randomId() },
      data: { direction: "up", reason: `Great price ${runTag}` }
    });
    await expectStatus(vote, 201);
    const voteBody = await vote.json();
    expect(voteBody?.deal?.deal_id).toBe(dealId);
    expect(voteBody?.deal?.status).toBe("ACTIVE");
    expect(voteBody?.deal?.votes_up).toBeGreaterThanOrEqual(1);
    expect(voteBody?.deal?.temperature).not.toBeNull();

    // Ops sees the deal in console list with temperature and votes.
    const opsList = await request.get(`/api/console/deals?sort=trend&status=ACTIVE&tags=${runTag}&limit=10`);
    await expectStatus(opsList, 200);
    const opsListBody = await opsList.json();
    const listed = (opsListBody.items || []).find((d: any) => d.deal_id === dealId);
    expect(listed).toBeTruthy();
    expect(listed.status).toBe("ACTIVE");
    expect(listed.temperature).not.toBeNull();
    expect(listed.votes_up).toBeGreaterThanOrEqual(1);

    // Ops posts a note and can read it back.
    const createComment = await request.post(`/api/console/deals/${dealId}/comments`, {
      data: { comment_type: "note", body: `Ops note ${runTag}` }
    });
    await expectStatus(createComment, 201);

    const listComments = await request.get(`/api/console/deals/${dealId}/comments?limit=10`);
    await expectStatus(listComments, 200);
    const commentsBody = await listComments.json();
    expect((commentsBody.items || []).some((c: any) => c.body === `Ops note ${runTag}`)).toBe(true);
  });
});

