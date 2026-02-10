import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

function extractClaimToken(claimUrl: string): string {
  try {
    const url = new URL(String(claimUrl));
    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    const raw = String(claimUrl || "");
    const idx = raw.lastIndexOf("/claim/");
    if (idx === -1) return "";
    return decodeURIComponent(raw.slice(idx + "/claim/".length));
  }
}

test.describe.serial("Integration: Connect Sessions", () => {
  test.setTimeout(60_000);

  test("create session + poll + invalid poll token", async ({ request }) => {
    const ip = randomIp();
    const idem = randomId();
    const create = await request.post("/api/v1/connect/sessions", {
      headers: {
        "Idempotency-Key": idem,
        "x-forwarded-for": ip,
        "x-client-type": "openclaw",
        "x-client-version": "itest"
      },
      data: {
        requested_agent_name: "Integration Connect",
        requested_scopes: ["agent:read"]
      }
    });
    await expectStatus(create, 201);
    const body = await create.json();

    const sessionId = body?.data?.session_id;
    const pollToken = body?.data?.poll_token;
    const claimUrl = body?.data?.claim_url;

    expect(sessionId).toBeTruthy();
    expect(pollToken).toBeTruthy();
    expect(claimUrl).toContain("/claim/");

    const claimToken = extractClaimToken(claimUrl);
    expect(claimToken).toMatch(/^cd_claim_/);

    const poll = await request.get(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${pollToken}`
      }
    });
    await expectStatus(poll, 200);
    const pollBody = await poll.json();
    expect(pollBody?.data?.status).toBe("PENDING_CLAIM");

    const invalidPoll = await request.get(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${pollToken}x`
      }
    });
    expect(invalidPoll.status()).toBe(401);
    const invalidBody = await invalidPoll.json();
    expect(invalidBody?.error?.code).toBe("UNAUTHORIZED");
  });

  test("poll returns EXPIRED after expiry", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ip = randomIp();
    const create = await request.post("/api/v1/connect/sessions", {
      headers: {
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        requested_agent_name: "Integration Expire",
        requested_scopes: []
      }
    });
    await expectStatus(create, 201);
    const body = await create.json();

    const sessionId = body?.data?.session_id;
    const pollToken = body?.data?.poll_token;
    expect(sessionId).toBeTruthy();
    expect(pollToken).toBeTruthy();

    const createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: updateError } = await supabase
      .from("connect_sessions")
      .update({
        status: "PENDING_CLAIM",
        created_at: createdAt,
        updated_at: createdAt,
        expires_at: expiresAt
      })
      .eq("session_id", sessionId);
    expect(updateError).toBeNull();

    const poll = await request.get(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${pollToken}` }
    });
    await expectStatus(poll, 200);
    const pollBody = await poll.json();
    expect(pollBody?.data?.status).toBe("EXPIRED");
  });
});

