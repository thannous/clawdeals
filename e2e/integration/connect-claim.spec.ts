import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp, sleep } from "./helpers/ids";
import { createOwner, expectStatus } from "./helpers/http";
import { createAgentDb, createSupabaseAdmin, OPS_CONSOLE_AGENT_ID, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";

assertIntegrationEnv();

function extractClaimToken(claimUrl: string): string {
  const url = new URL(String(claimUrl));
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

async function ensureOwnerEmailVerified(supabase: any, ownerId: string) {
  const { error } = await supabase
    .from("owners")
    .update({
      email_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("owner_id", ownerId);
  expect(error).toBeNull();
}

test.describe.serial("Integration: Connect Claim", () => {
  test.setTimeout(60_000);

  test("resolve claim metadata + claim (v1) + poll shows CLAIMED", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);
    await ensureOwnerEmailVerified(supabase, ownerId);

    const ip = randomIp();
    const create = await request.post("/api/v1/connect/sessions", {
      headers: {
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        requested_agent_name: "Integration Connect",
        requested_scopes: []
      }
    });
    await expectStatus(create, 201);
    expect(create.headers()["cache-control"]).toBe("no-store");
    const createBody = await create.json();

    const sessionId = createBody?.data?.session_id;
    const pollToken = createBody?.data?.poll_token;
    const claimToken = extractClaimToken(createBody?.data?.claim_url);

    expect(sessionId).toBeTruthy();
    expect(pollToken).toBeTruthy();
    expect(claimToken).toMatch(/^cd_claim_/);

    const auditRequestId = randomId();
    const meta = await request.get(`/api/v1/connect/claims/${encodeURIComponent(claimToken)}`, {
      headers: { "x-forwarded-for": ip, "x-request-id": auditRequestId }
    });
    await expectStatus(meta, 200);
    const metaBody = await meta.json();
    expect(metaBody?.data?.session_id).toBe(sessionId);
    expect(metaBody?.data?.status).toBe("PENDING_CLAIM");

    // Ensure audit logs never contain claim_token (path param or payload) in cleartext.
    let auditRow: any = null;
    for (let i = 0; i < 20; i += 1) {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, request, action, payload, security")
        .eq("request_id", auditRequestId)
        .maybeSingle();
      if (!error && data) {
        auditRow = data;
        break;
      }
      await sleep(200);
    }
    expect(auditRow).not.toBeNull();
    expect(auditRow.action?.event).toBe("connect.claim_viewed");
    expect(auditRow.request?.path).toBe("/api/v1/connect/claims");
    expect(auditRow.action?.path).toBe("/api/v1/connect/claims");
    expect(auditRow.request?.query?.claim_token).toBeUndefined();
    expect(JSON.stringify(auditRow)).not.toContain(claimToken);

    const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: {
        "x-owner-id": ownerId,
        "Idempotency-Key": randomId()
      },
      data: {
        claim_token: claimToken,
        mode: "create_agent",
        agent_name: "Integration Claimed Agent"
      }
    });
    await expectStatus(claim, 200);
    const claimBody = await claim.json();
    expect(claimBody?.data?.status).toBe("CLAIMED");
    expect(claimBody?.data?.agent_id).toBeTruthy();

    const claimedAgentId = String(claimBody?.data?.agent_id || "");
    expect(claimedAgentId).toBeTruthy();

    let controlThread: any = null;
    for (let i = 0; i < 20; i += 1) {
      const { data, error } = await supabase
        .from("threads")
        .select("thread_id, thread_type, control_owner_id, control_agent_id")
        .eq("thread_type", "CONTROL_DM")
        .eq("control_owner_id", ownerId)
        .eq("control_agent_id", claimedAgentId)
        .maybeSingle();
      if (!error && data) {
        controlThread = data;
        break;
      }
      await sleep(100);
    }
    expect(controlThread).not.toBeNull();

    const { data: greetingRow, error: greetingError } = await supabase
      .from("messages")
      .select("sender_type, type, payload")
      .eq("thread_id", controlThread.thread_id)
      .eq("sender_type", "system")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    expect(greetingError).toBeNull();
    expect(greetingRow?.type).toBe("info");
    expect(String(greetingRow?.payload?.text || "")).toContain("Quick actions");
    expect(Array.isArray(greetingRow?.payload?.quick_actions)).toBe(true);
    expect(greetingRow?.payload?.quick_actions).toEqual(["Help", "Approvals", "Connected Apps"]);

    const { data: controlRows, error: controlRowsError } = await supabase
      .from("threads")
      .select("thread_id")
      .eq("thread_type", "CONTROL_DM")
      .eq("control_owner_id", ownerId)
      .eq("control_agent_id", claimedAgentId);
    expect(controlRowsError).toBeNull();
    expect((controlRows || []).length).toBe(1);

    const poll = await request.get(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${pollToken}` }
    });
    await expectStatus(poll, 200);
    const pollBody = await poll.json();
    expect(pollBody?.data?.status).toBe("CLAIMED");
  });

  test("deny (v1) returns CANCELLED and poll reflects it", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);
    await ensureOwnerEmailVerified(supabase, ownerId);

    const create = await request.post("/api/v1/connect/sessions", {
      headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
      data: { requested_agent_name: "Integration Deny", requested_scopes: [] }
    });
    await expectStatus(create, 201);
    const body = await create.json();

    const sessionId = body?.data?.session_id;
    const pollToken = body?.data?.poll_token;
    const claimToken = extractClaimToken(body?.data?.claim_url);

    const deny = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/deny`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { claim_token: claimToken }
    });
    await expectStatus(deny, 200);
    const denyBody = await deny.json();
    expect(denyBody?.data?.status).toBe("CANCELLED");

    const poll = await request.get(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${pollToken}` }
    });
    await expectStatus(poll, 200);
    const pollBody = await poll.json();
    expect(pollBody?.data?.status).toBe("CANCELLED");
  });

  test("owner limit blocks create_agent and allows attach_agent fallback", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);
    await ensureOwnerEmailVerified(supabase, ownerId);
    const ownerAgentLimitRaw = Number.parseInt(String(process.env.OWNER_AGENT_LIMIT || "1"), 10);
    const ownerAgentLimit = Number.isFinite(ownerAgentLimitRaw) && ownerAgentLimitRaw > 0 ? ownerAgentLimitRaw : 1;
    const existingAgent = await createAgentDb(supabase, ownerId);
    for (let i = 1; i < ownerAgentLimit; i += 1) {
      await createAgentDb(supabase, ownerId);
    }

    const create = await request.post("/api/v1/connect/sessions", {
      headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
      data: { requested_agent_name: "Integration Owner Limit", requested_scopes: [] }
    });
    await expectStatus(create, 201);
    const body = await create.json();

    const sessionId = body?.data?.session_id;
    const pollToken = body?.data?.poll_token;
    const claimToken = extractClaimToken(body?.data?.claim_url);

    const createModeClaim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {
        claim_token: claimToken,
        mode: "create_agent",
        agent_name: "Should Not Create"
      }
    });
    await expectStatus(createModeClaim, 409);
    const createModeBody = await createModeClaim.json();
    expect(createModeBody?.error?.code).toBe("OWNER_AGENT_LIMIT_REACHED");

    const attachClaim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {
        claim_token: claimToken,
        mode: "attach_agent",
        attach_agent_id: existingAgent.id
      }
    });
    await expectStatus(attachClaim, 200);
    const attachBody = await attachClaim.json();
    expect(attachBody?.data?.status).toBe("CLAIMED");
    expect(attachBody?.data?.agent_id).toBe(existingAgent.id);

    const poll = await request.get(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${pollToken}` }
    });
    await expectStatus(poll, 200);
    const pollBody = await poll.json();
    expect(pollBody?.data?.status).toBe("CLAIMED");
  });

  test("claim via console wrapper (ops) works", async ({ request }) => {
    const baseUrl =
      process.env.API_BASE_URL ||
      process.env.E2E_BASE_URL ||
      `http://localhost:${process.env.E2E_DEV_PORT || 3000}`;

    const createConsoleSession = async () => {
      const create = await request.post("/api/v1/connect/sessions", {
        headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
        data: { requested_agent_name: "Integration Console Claim", requested_scopes: [] }
      });
      await expectStatus(create, 201);
      const body = await create.json();
      return {
        sessionId: body?.data?.session_id,
        claimToken: extractClaimToken(body?.data?.claim_url)
      };
    };

    const primary = await createConsoleSession();

    const claim = await request.post(`/api/console/connect/sessions/${encodeURIComponent(primary.sessionId)}/claim`, {
      headers: {
        "Idempotency-Key": randomId(),
        origin: baseUrl,
        referer: `${baseUrl}/console`
      },
      data: { claim_token: primary.claimToken, mode: "create_agent", agent_name: "Ops Claimed Agent" }
    });
    let claimBody: any = null;
    if (claim.status() === 409) {
      claimBody = await claim.json();
      expect(claimBody?.error?.code).toBe("OWNER_AGENT_LIMIT_REACHED");
      // Use a fresh session for attach fallback to avoid coupling with any partial state from the create-agent attempt.
      const fallback = await createConsoleSession();
      const attachClaim = await request.post(`/api/console/connect/sessions/${encodeURIComponent(fallback.sessionId)}/claim`, {
        headers: {
          "Idempotency-Key": randomId(),
          origin: baseUrl,
          referer: `${baseUrl}/console`
        },
        data: { claim_token: fallback.claimToken, mode: "attach_agent", attach_agent_id: OPS_CONSOLE_AGENT_ID }
      });
      await expectStatus(attachClaim, 200);
      claimBody = await attachClaim.json();
    } else {
      await expectStatus(claim, 200);
      claimBody = await claim.json();
    }
    expect(claimBody?.data?.status).toBe("CLAIMED");
    expect(claimBody?.data?.owner_id).toBe(OPS_CONSOLE_OWNER_ID);
    expect(claimBody?.data?.agent_id).toBeTruthy();
  });
});
