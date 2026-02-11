import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sleep } from "./helpers/ids";
import {
  expectStatus,
  markTransactionCompleted,
  openDispute
} from "./helpers/http";
import { setupEscrowOnHold } from "./helpers/escrow";
import { setVerifiedOwnerContact } from "./helpers/marketplace";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";

assertIntegrationEnv();

async function waitForContactRevealApprovedAudit(
  supabase: any,
  txId: string,
  startedAt: string
) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("payload,request,occurred_at")
      .eq("action->>event", "contact_reveal.approved")
      .order("occurred_at", { ascending: false })
      .limit(20);

    if (!error && Array.isArray(data)) {
      const row = data.find((entry: any) => entry?.payload?.tx_id === txId && entry?.occurred_at >= startedAt);
      if (row) return row;
    }

    await sleep(300);
  }

  return null;
}

test.describe.serial("Integration: Cross-agent authorization isolation", () => {
  test.setTimeout(120000);

  test("third-party cannot access tx or escrow actions", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request, { listingTitlePrefix: "Authz isolation listing" });

    const thirdOwnerId = randomId();
    await ensureOwnerDb(fixture.supabase, thirdOwnerId);
    const thirdAgent = await createAgentDbWithOverrides(fixture.supabase, thirdOwnerId, {
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: thirdApiKey } = await createActiveApiKeyDb(fixture.supabase, thirdAgent.id);

    const txGetRes = await request.get(`/api/v1/transactions/${encodeURIComponent(fixture.txId)}`, {
      headers: { Authorization: `Bearer ${thirdApiKey}` }
    });
    await expectStatus(txGetRes, 404);
    expect((await txGetRes.json())?.error?.code).toBe("TX_NOT_FOUND");

    const markCompletedRes = await markTransactionCompleted(request, thirdApiKey, fixture.txId, { idempotencyKey: randomId() });
    await expectStatus(markCompletedRes, 404);
    expect((await markCompletedRes.json())?.error?.code).toBe("TX_NOT_FOUND");

    const payRes = await request.post(`/api/v1/escrows/${encodeURIComponent(fixture.escrowId)}/pay`, {
      headers: { Authorization: `Bearer ${thirdApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(payRes, 404);
    expect((await payRes.json())?.error?.code).toBe("ESCROW_NOT_FOUND");

    const deliverRes = await request.post(`/api/v1/escrows/${encodeURIComponent(fixture.escrowId)}/mark-delivered`, {
      headers: { Authorization: `Bearer ${thirdApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(deliverRes, 404);
    expect((await deliverRes.json())?.error?.code).toBe("ESCROW_NOT_FOUND");

    const confirmRes = await request.post(`/api/v1/escrows/${encodeURIComponent(fixture.escrowId)}/confirm-received`, {
      headers: { Authorization: `Bearer ${thirdApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(confirmRes, 404);
    expect((await confirmRes.json())?.error?.code).toBe("ESCROW_NOT_FOUND");

    const disputeRes = await openDispute(
      request,
      thirdApiKey,
      fixture.escrowId,
      { reasonCode: "other", notes: "third-party should be blocked" },
      { idempotencyKey: randomId() }
    );
    await expectStatus(disputeRes, 404);
    expect((await disputeRes.json())?.error?.code).toBe("ESCROW_NOT_FOUND");
  });

  test("contact reveal audit does not expose raw PII", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const fixture = await setupEscrowOnHold(request, { listingTitlePrefix: "Authz contact reveal listing", supabase });

    const sellerEmail = `itest+seller-${fixture.sellerOwnerId.slice(0, 8)}@example.com`;
    const buyerEmail = `itest+buyer-${fixture.buyerOwnerId.slice(0, 8)}@example.com`;
    const sellerPhone = "+33611112222";
    const buyerPhone = "+33633334444";

    await setVerifiedOwnerContact(supabase, fixture.sellerOwnerId, { email: sellerEmail, phoneE164: sellerPhone });
    await setVerifiedOwnerContact(supabase, fixture.buyerOwnerId, { email: buyerEmail, phoneE164: buyerPhone });

    const startedAt = new Date().toISOString();
    const reqRes = await request.post(`/api/v1/transactions/${encodeURIComponent(fixture.txId)}/request-contact-reveal`, {
      headers: { Authorization: `Bearer ${fixture.buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(reqRes, 202);

    const approveRes = await request.post(`/api/v1/transactions/${encodeURIComponent(fixture.txId)}/approve-contact-reveal`, {
      headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveRes, 200);

    const thirdOwnerId = randomId();
    await ensureOwnerDb(supabase, thirdOwnerId);
    const thirdAgent = await createAgentDbWithOverrides(supabase, thirdOwnerId, {
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: thirdApiKey } = await createActiveApiKeyDb(supabase, thirdAgent.id);

    const hiddenTxRes = await request.get(`/api/v1/transactions/${encodeURIComponent(fixture.txId)}`, {
      headers: { Authorization: `Bearer ${thirdApiKey}` }
    });
    await expectStatus(hiddenTxRes, 404);
    expect((await hiddenTxRes.json())?.error?.code).toBe("TX_NOT_FOUND");

    const auditRow = await waitForContactRevealApprovedAudit(supabase, fixture.txId, startedAt);
    expect(auditRow).not.toBeNull();

    const payloadStr = JSON.stringify(auditRow?.payload || {});
    const requestStr = JSON.stringify(auditRow?.request || {});

    for (const token of [sellerEmail, buyerEmail, sellerPhone, buyerPhone]) {
      expect(payloadStr).not.toContain(token);
      expect(requestStr).not.toContain(token);
    }
  });
});
