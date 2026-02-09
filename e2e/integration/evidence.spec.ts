import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, acceptOffer, expectStatus } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  ensureStorageBucket
} from "./helpers/supabase";
import {
  initEvidenceUpload,
  uploadEvidenceBytes,
  confirmEvidenceUpload,
  createEvidenceTestFixture,
  mutateEvidenceHash
} from "./helpers/evidence";

assertIntegrationEnv();

const routesExist = [
  path.join(process.cwd(), "src/pages/api/v1/disputes/[dispute_id]/[action].ts")
].every((candidate) => fs.existsSync(candidate));

async function setupPolicy(request: any, ownerId: string) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);
}

async function setupDisputeFixture(request: any) {
  const supabase = createSupabaseAdmin();
  await ensureStorageBucket(supabase, "evidence", { public: false });

  const sellerOwnerId = randomId();
  await ensureOwnerDb(supabase, sellerOwnerId);
  await setupPolicy(request, sellerOwnerId);

  const buyerOwnerId = randomId();
  await ensureOwnerDb(supabase, buyerOwnerId);

  const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

  const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

  const listingRes = await createListing(request, sellerApiKey, { title: `Evidence listing ${randomId()}`, publish: true });
  await expectStatus(listingRes, 201);
  const listingBody = await listingRes.json();
  const listingId = listingBody.listing_id;

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const offerRes = await createOffer(
    request,
    buyerApiKey,
    listingId,
    { threadId: null, amount: 350, currency: "EUR", expiresAt },
    { idempotencyKey: randomId() }
  );
  await expectStatus(offerRes, 201);
  const offerBody = await offerRes.json();
  const offerId = offerBody.offer_id;

  const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
  await expectStatus(acceptRes, 200);
  const acceptBody = await acceptRes.json();
  const txId = acceptBody.transaction?.tx_id;
  expect(typeof txId).toBe("string");

  const escrowPayload = {
    tx_id: txId,
    buyer_agent_id: buyerAgent.id,
    seller_agent_id: sellerAgent.id,
    currency: "EUR",
    amount_gross_minor: 1000,
    platform_fee_bps: 400,
    amount_platform_fee_minor: 40,
    amount_net_minor: 960,
    status: "CREATED"
  };

  const { data: escrowRow, error: escrowErr } = await supabase
    .from("escrows")
    .insert(escrowPayload)
    .select("escrow_id")
    .single();
  if (escrowErr) throw escrowErr;

  const { data: disputeRow, error: disputeErr } = await supabase
    .from("disputes")
    .insert({
      escrow_id: escrowRow.escrow_id,
      status: "OPEN",
      opened_by: "BUYER",
      reason_code: "item_not_received",
      resolution: "NONE_YET",
      opened_at: new Date().toISOString()
    })
    .select("dispute_id")
    .single();
  if (disputeErr) throw disputeErr;

  return {
    supabase,
    disputeId: disputeRow.dispute_id,
    buyerApiKey,
    sellerApiKey,
    buyerAgentId: buyerAgent.id,
    sellerAgentId: sellerAgent.id
  };
}

test.describe.serial("Integration: Evidence Pack (TI-214)", () => {
  test.skip(!routesExist, "Evidence endpoints not implemented in this branch");

  test.setTimeout(60000);

  test("signed upload + upload bytes + confirm hash", async ({ request }) => {
    const fixture = await setupDisputeFixture(request);

    const upload = await initEvidenceUpload(request, {
      disputeId: fixture.disputeId,
      apiKey: fixture.buyerApiKey
    });

    const evidence = createEvidenceTestFixture();
    await uploadEvidenceBytes(request, {
      url: upload.url,
      bytes: evidence.bytes,
      contentType: evidence.contentType
    });

    const confirm = await confirmEvidenceUpload(request, {
      disputeId: fixture.disputeId,
      apiKey: fixture.buyerApiKey,
      bucket: upload.bucket,
      key: upload.key,
      sha256: evidence.sha256,
      contentType: evidence.contentType,
      bytes: evidence.bytes.byteLength
    });
    expect(confirm.evidence_item_id).toBeTruthy();

    const listRes = await request.get(`/api/v1/disputes/${encodeURIComponent(fixture.disputeId)}/evidence`, {
      headers: { Authorization: `Bearer ${fixture.buyerApiKey}` }
    });
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    expect(listBody.dispute_id).toBe(fixture.disputeId);
    expect(listBody.items?.length).toBeGreaterThan(0);
    const matched = (listBody.items || []).find((item: any) => item.sha256 === evidence.sha256);
    expect(matched).toBeTruthy();
    expect(matched.storage_bucket).toBe(upload.bucket);
    expect(matched.storage_key).toBe(upload.key);
  });

  test("hash mismatch returns 400 EVIDENCE_HASH_INVALID", async ({ request }) => {
    const fixture = await setupDisputeFixture(request);

    const upload = await initEvidenceUpload(request, {
      disputeId: fixture.disputeId,
      apiKey: fixture.buyerApiKey
    });

    const evidence = createEvidenceTestFixture();
    await uploadEvidenceBytes(request, {
      url: upload.url,
      bytes: evidence.bytes,
      contentType: evidence.contentType
    });

    const res = await request.post(`/api/v1/disputes/${encodeURIComponent(fixture.disputeId)}/evidence:confirm`, {
      headers: {
        Authorization: `Bearer ${fixture.buyerApiKey}`,
        "Idempotency-Key": randomId()
      },
      data: {
        bucket: upload.bucket,
        key: upload.key,
        sha256: mutateEvidenceHash(evidence.sha256),
        content_type: evidence.contentType,
        bytes: evidence.bytes.byteLength
      }
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body?.error?.code).toBe("EVIDENCE_HASH_INVALID");
  });

  test("unauthorized evidence access returns 404", async ({ request }) => {
    const fixture = await setupDisputeFixture(request);

    const otherOwnerId = randomId();
    await ensureOwnerDb(fixture.supabase, otherOwnerId);
    const otherAgent = await createAgentDbWithOverrides(fixture.supabase, otherOwnerId, {});
    const { apiKey: otherApiKey } = await createActiveApiKeyDb(fixture.supabase, otherAgent.id);

    const initRes = await request.post(`/api/v1/disputes/${encodeURIComponent(fixture.disputeId)}/evidence`, {
      headers: { Authorization: `Bearer ${otherApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    expect(initRes.status()).toBe(404);

    const listRes = await request.get(`/api/v1/disputes/${encodeURIComponent(fixture.disputeId)}/evidence`, {
      headers: { Authorization: `Bearer ${otherApiKey}` }
    });
    expect(listRes.status()).toBe(404);
  });
});
