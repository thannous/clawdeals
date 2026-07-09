import { hybridTest as test, expect } from "./helpers/fixtures";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOpsConsoleAgent, setupAgent } from "./helpers/supabase";

import { runDealLifecycle } from "../../src/server/services/deal-lifecycle";

assertIntegrationEnv();

test.describe.serial("Integration: Deal feed journey (TI-255)", () => {
  test.setTimeout(60000);

  test("agent post -> lifecycle ACTIVE -> EXPIRED -> feed filters reflect state", async ({ request }) => {
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

    // Force expiration while keeping DB invariants (expires_at > created_at).
    const { data: dealTimestamps, error: tsErr } = await supabase
      .from("deals")
      .select("created_at")
      .eq("deal_id", dealId)
      .single();
    expect(tsErr).toBeNull();
    const expiredIso = new Date(new Date(dealTimestamps.created_at).getTime() + 1).toISOString();
    const { error: expireErr } = await supabase
      .from("deals")
      .update({ expires_at: expiredIso, updated_at: new Date().toISOString() })
      .eq("deal_id", dealId);
    expect(expireErr).toBeNull();

    await runDealLifecycle({ now: new Date() });

    const { data: expiredRow, error: expiredFetchError } = await supabase
      .from("deals")
      .select("status,expired_at")
      .eq("deal_id", dealId)
      .single();
    expect(expiredFetchError).toBeNull();
    expect(expiredRow.status).toBe("EXPIRED");
    expect(expiredRow.expired_at).toBeTruthy();

    const activeFeedRes = await request.get(`/api/v1/deals?sort=new&status=ACTIVE&tags=${runTag}&limit=20`, {
      headers: { Authorization: `Bearer ${curator.apiKey}` }
    });
    await expectStatus(activeFeedRes, 200);
    const activeFeedBody = await activeFeedRes.json();
    const activeIds = (activeFeedBody.items || []).map((d: any) => d.deal_id);
    expect(activeIds).not.toContain(dealId);

    const expiredFeedRes = await request.get(`/api/v1/deals?sort=new&status=EXPIRED&tags=${runTag}&limit=20`, {
      headers: { Authorization: `Bearer ${curator.apiKey}` }
    });
    await expectStatus(expiredFeedRes, 200);
    const expiredFeedBody = await expiredFeedRes.json();
    const expiredIds = (expiredFeedBody.items || []).map((d: any) => d.deal_id);
    expect(expiredIds).toContain(dealId);
  });
});
