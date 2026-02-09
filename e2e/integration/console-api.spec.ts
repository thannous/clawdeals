import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sha256Hex } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOpsConsoleAgent, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Console API", () => {
  test.setTimeout(60000);

  test("console deals list returns deals with temperature masking", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { agent } = await setupAgent(supabase);

    const runTag = `console${randomId().split("-")[0]}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const urlNew = `https://example.com/console/${randomId()}`;
    const urlActive = `https://example.com/console/${randomId()}`;

    const { error } = await supabase.from("deals").insert([
      {
        title: "Console NEW Deal",
        source_url: urlNew,
        source_url_normalized: urlNew,
        source_url_fingerprint: sha256Hex(urlNew),
        price: 10,
        currency: "EUR",
        created_at: now.toISOString(),
        expires_at: expiresAt,
        tags: [runTag],
        status: "NEW",
        new_until: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        temperature: 99,
        creator_agent_id: agent.id
      },
      {
        title: "Console ACTIVE Deal",
        source_url: urlActive,
        source_url_normalized: urlActive,
        source_url_fingerprint: sha256Hex(urlActive),
        price: 20,
        currency: "EUR",
        created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        expires_at: expiresAt,
        tags: [runTag],
        status: "ACTIVE",
        new_until: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        active_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        temperature: 72,
        creator_agent_id: agent.id
      }
    ]);
    expect(error).toBeNull();

    const res = await request.get(`/api/console/deals?sort=new&tags=${runTag}&limit=10`);
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);

    const newDeal = body.items.find((d: any) => d.title === "Console NEW Deal");
    const activeDeal = body.items.find((d: any) => d.title === "Console ACTIVE Deal");

    expect(newDeal).toBeTruthy();
    expect(newDeal.temperature).toBeNull();
    expect(newDeal.status).toBe("NEW");

    expect(activeDeal).toBeTruthy();
    expect(activeDeal.temperature).toBe(72);
    expect(activeDeal.status).toBe("ACTIVE");
  });

  test("console deals list supports pagination", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { agent } = await setupAgent(supabase);

    const runTag = `pag${randomId().split("-")[0]}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const deals: any[] = [];
    for (let i = 0; i < 3; i++) {
      const url = `https://example.com/pag/${randomId()}`;
      deals.push({
        title: `Pagination Deal ${i}`,
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 10 + i,
        currency: "EUR",
        created_at: new Date(now.getTime() - i * 60 * 1000).toISOString(),
        expires_at: expiresAt,
        tags: [runTag],
        status: "ACTIVE",
        new_until: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        active_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        temperature: 50 + i,
        creator_agent_id: agent.id
      });
    }
    const { error } = await supabase.from("deals").insert(deals);
    expect(error).toBeNull();

    const page1 = await request.get(`/api/console/deals?sort=new&tags=${runTag}&limit=1&status=ACTIVE`);
    await expectStatus(page1, 200);
    const page1Body = await page1.json();
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.next_cursor).toBeTruthy();

    const page2 = await request.get(
      `/api/console/deals?sort=new&tags=${runTag}&limit=1&status=ACTIVE&cursor=${encodeURIComponent(page1Body.next_cursor)}`
    );
    await expectStatus(page2, 200);
    const page2Body = await page2.json();
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.items[0].deal_id).not.toBe(page1Body.items[0].deal_id);
  });

  test("console deals list rejects invalid cursor", async ({ request }) => {
    const res = await request.get("/api/console/deals?cursor=invalid-cursor");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("console deal detail returns temperature masking (NEW) and temperature value (ACTIVE)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const runTag = `detail${randomId().split("-")[0]}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const urlNew = `https://example.com/console-detail/${randomId()}`;
    const urlActive = `https://example.com/console-detail/${randomId()}`;

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert([
        {
          title: "Console Detail NEW",
          source_url: urlNew,
          source_url_normalized: urlNew,
          source_url_fingerprint: sha256Hex(urlNew),
          price: 10,
          currency: "EUR",
          created_at: now.toISOString(),
          expires_at: expiresAt,
          tags: [runTag],
          status: "NEW",
          new_until: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
          temperature: 99,
          creator_agent_id: agent.id
        },
        {
          title: "Console Detail ACTIVE",
          source_url: urlActive,
          source_url_normalized: urlActive,
          source_url_fingerprint: sha256Hex(urlActive),
          price: 20,
          currency: "EUR",
          created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
          expires_at: expiresAt,
          tags: [runTag],
          status: "ACTIVE",
          new_until: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          active_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          temperature: 72,
          creator_agent_id: agent.id
        }
      ])
      .select("deal_id,title");
    expect(error).toBeNull();
    const idsByTitle = new Map((inserted || []).map((row: any) => [row.title, row.deal_id]));
    const newId = idsByTitle.get("Console Detail NEW");
    const activeId = idsByTitle.get("Console Detail ACTIVE");
    expect(newId).toBeTruthy();
    expect(activeId).toBeTruthy();

    const newRes = await request.get(`/api/console/deals/${newId}`);
    await expectStatus(newRes, 200);
    const newBody = await newRes.json();
    expect(newBody.deal.deal_id).toBe(newId);
    expect(newBody.deal.status).toBe("NEW");
    expect(newBody.deal.temperature).toBeNull();

    const activeRes = await request.get(`/api/console/deals/${activeId}`);
    await expectStatus(activeRes, 200);
    const activeBody = await activeRes.json();
    expect(activeBody.deal.deal_id).toBe(activeId);
    expect(activeBody.deal.status).toBe("ACTIVE");
    expect(activeBody.deal.temperature).toBe(72);
  });

  test("console deal comments supports list + create and rejects URLs", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const url = `https://example.com/console-comments/${randomId()}`;

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Console Comments Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 15,
        currency: "EUR",
        created_at: now.toISOString(),
        expires_at: expiresAt,
        tags: ["consolecomments"],
        status: "ACTIVE",
        new_until: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        active_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        temperature: 50,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();
    const dealId = inserted.deal_id;

    const list0 = await request.get(`/api/console/deals/${dealId}/comments?limit=10`);
    await expectStatus(list0, 200);
    const list0Body = await list0.json();
    expect(Array.isArray(list0Body.items)).toBe(true);
    expect(list0Body.items).toHaveLength(0);

    const create = await request.post(`/api/console/deals/${dealId}/comments`, {
      data: { comment_type: "note", body: "Ops note" }
    });
    await expectStatus(create, 201);
    const createBody = await create.json();
    expect(createBody.comment.deal_id).toBe(dealId);
    expect(createBody.comment.comment_type).toBe("note");
    expect(createBody.comment.body).toBe("Ops note");

    const list1 = await request.get(`/api/console/deals/${dealId}/comments?limit=10`);
    await expectStatus(list1, 200);
    const list1Body = await list1.json();
    expect((list1Body.items || []).length).toBeGreaterThanOrEqual(1);
    expect((list1Body.items || []).some((item: any) => item.body === "Ops note")).toBe(true);

    const createWithUrl = await request.post(`/api/console/deals/${dealId}/comments`, {
      data: { comment_type: "note", body: "see https://example.com" }
    });
    expect(createWithUrl.status()).toBe(400);
    const createWithUrlBody = await createWithUrl.json();
    expect(createWithUrlBody.error.code).toBe("URLS_NOT_ALLOWED");
  });

  test("console vote creates vote with hardcoded agent", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const url = `https://example.com/vote/${randomId()}`;
    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Console Vote Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 15,
        currency: "EUR",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["consolevote"],
        status: "ACTIVE",
        new_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        active_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        temperature: 50,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();

    const dealId = inserted.deal_id;
    const voteRes = await request.post(`/api/console/deals/${dealId}/vote`, {
      data: { direction: "up", reason: "Excellent deal for testing" }
    });
    await expectStatus(voteRes, 201);

    const voteBody = await voteRes.json();
    expect(voteBody.vote.deal_id).toBe(dealId);
    expect(voteBody.vote.agent_id).toBe("00000000-0000-4000-a000-000000000001");
    expect(voteBody.vote.weight).toBe(1);
    expect(voteBody.deal.votes_up).toBeGreaterThanOrEqual(1);
  });

  test("console vote rejects expired deal", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const url = `https://example.com/expired/${randomId()}`;
    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Expired Console Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 25,
        currency: "EUR",
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        tags: ["expired"],
        status: "EXPIRED",
        new_until: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        active_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        temperature: 42,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();

    const voteRes = await request.post(`/api/console/deals/${inserted.deal_id}/vote`, {
      data: { direction: "down", reason: "Expired deal test" }
    });
    expect(voteRes.status()).toBe(409);
    const body = await voteRes.json();
    expect(body.error.code).toBe("DEAL_EXPIRED");
  });

  test("console vote rejects duplicate vote", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const url = `https://example.com/dup/${randomId()}`;
    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Dup Vote Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 30,
        currency: "EUR",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["dupvote"],
        status: "ACTIVE",
        new_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        active_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        temperature: 50,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();

    const dealId = inserted.deal_id;

    const first = await request.post(`/api/console/deals/${dealId}/vote`, {
      data: { direction: "up", reason: "First vote" }
    });
    await expectStatus(first, 201);

    const dup = await request.post(`/api/console/deals/${dealId}/vote`, {
      data: { direction: "up", reason: "Second vote" }
    });
    expect(dup.status()).toBe(409);
    const dupBody = await dup.json();
    expect(dupBody.error.code).toBe("ALREADY_VOTED");
  });

  test("console vote validates inputs", async ({ request }) => {
    const badIdRes = await request.post("/api/console/deals/not-a-uuid/vote", {
      data: { direction: "up", reason: "Test" }
    });
    expect(badIdRes.status()).toBe(400);

    const badDirRes = await request.post("/api/console/deals/2b079372-0a7a-4fa1-93e0-1f269ea0f1d7/vote", {
      data: { direction: "sideways", reason: "Test" }
    });
    expect(badDirRes.status()).toBe(400);

    const noReasonRes = await request.post("/api/console/deals/2b079372-0a7a-4fa1-93e0-1f269ea0f1d7/vote", {
      data: { direction: "up", reason: "" }
    });
    expect(noReasonRes.status()).toBe(400);
  });
});
