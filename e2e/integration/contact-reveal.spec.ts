import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, acceptOffer, expectStatus } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import { waitForAuditLogMatching } from "./helpers/audit";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  ensureOpsConsoleAgent,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";

assertIntegrationEnv();

const contactRoutesExist = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/request-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/approve-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/deny-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id].ts")
].every((candidate) => fs.existsSync(candidate));

async function setupPolicy(request: any, ownerId: string) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: { message_types: [], actions: ["listing.create", "thread.create", "offer.accept"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);
}

async function setVerifiedOwnerContact(
  supabase: any,
  ownerId: string,
  { email, phoneE164 }: { email: string; phoneE164: string }
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("owners")
    .update({
      email,
      email_verified_at: now,
      phone_e164: phoneE164,
      phone_verified_at: now,
      updated_at: now
    })
    .eq("owner_id", ownerId);
  if (error) throw error;
}

async function waitForSseEvent(response: Response, eventName: string) {
  const frame = await waitForSseFrame(response, {
    timeoutMs: 7500,
    onFrame: (entry) => (entry.type === "event" && entry.event === eventName ? entry : undefined)
  });
  if (frame.type !== "event") throw new Error("Expected SSE event frame");
  return JSON.parse(frame.data);
}

test.describe.serial("Integration: Contact reveal (TI-202/TI-203)", () => {
  test.skip(!contactRoutesExist, "Contact reveal endpoints not implemented in this branch");

  test.setTimeout(60000);

  test("manual approval => requested SSE + approve returns masked contacts + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    await setVerifiedOwnerContact(supabase, ownerId, {
      email: `itest+seller-${ownerId.split("-")[0]}@example.com`,
      phoneE164: "+33600001234"
    });
    await setVerifiedOwnerContact(supabase, buyerOwnerId, {
      email: `itest+buyer-${buyerOwnerId.split("-")[0]}@example.com`,
      phoneE164: "+33612345678"
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `Contact reveal listing ${randomId()}`, publish: true });
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

    const types = encodeURIComponent("contact_reveal.requested,contact_reveal.approved,contact_reveal.denied");
    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });
    const sellerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      expect(sellerSse.res.status).toBe(200);

      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      await waitForSseFrame(sellerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const reqRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/request-contact-reveal`, {
        headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(reqRes, 202);
      const reqBody = await reqRes.json();
      expect(reqBody.tx_id).toBe(txId);
      expect(reqBody.contact_reveal_state).toBe("REQUESTED");
      expect(typeof reqBody.approval_id).toBe("string");

      const approvalId = reqBody.approval_id;

      const { data: txRow, error: txErr } = await supabase
        .from("transactions")
        .select("tx_id,status,contact_reveal_state,contact_revealed_at")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr) throw txErr;
      expect(txRow?.contact_reveal_state).toBe("REQUESTED");
      expect(txRow?.status).toBe("ACCEPTED");
      expect(txRow?.contact_revealed_at).toBeNull();

      const { data: approvalRow, error: approvalErr } = await supabase
        .from("approvals")
        .select("approval_id,action_type,action_ref_id,state")
        .eq("approval_id", approvalId)
        .maybeSingle();
      if (approvalErr) throw approvalErr;
      expect(approvalRow?.action_type).toBe("contact_reveal");
      expect(approvalRow?.action_ref_id).toBe(txId);
      expect(approvalRow?.state).toBe("PENDING");

      const buyerRequested = await waitForSseEvent(buyerSse.res, "contact_reveal.requested");
      const sellerRequested = await waitForSseEvent(sellerSse.res, "contact_reveal.requested");
      for (const ev of [buyerRequested, sellerRequested]) {
        expect(ev.type).toBe("contact_reveal.requested");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.approval_id).toBe(approvalId);
        expect(ev.payload?.contact_reveal_state).toBe("REQUESTED");
      }

      const requestAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "contact_reveal.requested" &&
          row.payload?.tx_id === txId &&
          row.payload?.approval_id === approvalId,
        40
      );
      expect(requestAudit).toBeTruthy();

      const approveRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/approve-contact-reveal`, {
        headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(approveRes, 200);
      const approveBody = await approveRes.json();

      expect(approveBody.tx_id).toBe(txId);
      expect(approveBody.status).toBe("CONTACT_REVEALED");
      expect(approveBody.contact_reveal_state).toBe("APPROVED");
      expect(approveBody.contact_revealed_at).toBeTruthy();

      const emailMaskedRe = /^[^@]\*{3}@[^\s@.]\*+\.[a-z]{2,}$/i;
      const phoneMaskedRe = /^\+\d{1,3} \*\* \*\* \*\* \d{2} \d{2}$/;
      expect(approveBody.buyer_contact?.email_masked).toMatch(emailMaskedRe);
      expect(approveBody.seller_contact?.email_masked).toMatch(emailMaskedRe);
      expect(approveBody.buyer_contact?.phone_masked).toMatch(phoneMaskedRe);
      expect(approveBody.seller_contact?.phone_masked).toMatch(phoneMaskedRe);

      const { data: txRowApproved, error: txErr2 } = await supabase
        .from("transactions")
        .select("tx_id,status,contact_reveal_state,contact_revealed_at")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr2) throw txErr2;
      expect(txRowApproved?.contact_reveal_state).toBe("APPROVED");
      expect(txRowApproved?.status).toBe("CONTACT_REVEALED");
      expect(txRowApproved?.contact_revealed_at).toBeTruthy();

      const buyerApproved = await waitForSseEvent(buyerSse.res, "contact_reveal.approved");
      const sellerApproved = await waitForSseEvent(sellerSse.res, "contact_reveal.approved");
      for (const ev of [buyerApproved, sellerApproved]) {
        expect(ev.type).toBe("contact_reveal.approved");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.approval_id).toBe(approvalId);
        expect(ev.payload?.contact_reveal_state).toBe("APPROVED");
      }

      const approveAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "contact_reveal.approved" &&
          row.payload?.tx_id === txId &&
          row.payload?.approval_id === approvalId,
        40
      );
      expect(approveAudit).toBeTruthy();

      const getRes = await request.get(`/api/v1/transactions/${encodeURIComponent(txId)}`, {
        headers: { Authorization: `Bearer ${buyerApiKey}` }
      });
      await expectStatus(getRes, 200);
      const getBody = await getRes.json();
      expect(getBody?.data?.tx_id).toBe(txId);
      expect(getBody?.data?.contact_reveal_state).toBe("APPROVED");
      expect(getBody?.data?.buyer_contact?.email_masked).toMatch(emailMaskedRe);
      expect(getBody?.data?.seller_contact?.phone_masked).toMatch(phoneMaskedRe);
    } finally {
      buyerSse.controller.abort();
      sellerSse.controller.abort();
    }
  });

  test("deny + retry => denied SSE + re-request reopens same approval + approve succeeds", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    await setVerifiedOwnerContact(supabase, ownerId, {
      email: `itest+seller-${ownerId.split("-")[0]}@example.com`,
      phoneE164: "+33600009876"
    });
    await setVerifiedOwnerContact(supabase, buyerOwnerId, {
      email: `itest+buyer-${buyerOwnerId.split("-")[0]}@example.com`,
      phoneE164: "+33612345678"
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `Contact deny listing ${randomId()}`, publish: true });
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

    const types = encodeURIComponent("contact_reveal.requested,contact_reveal.approved,contact_reveal.denied");
    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });
    const sellerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      expect(sellerSse.res.status).toBe(200);

      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      await waitForSseFrame(sellerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const firstReq = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/request-contact-reveal`, {
        headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(firstReq, 202);
      const firstReqBody = await firstReq.json();
      const firstApprovalId = firstReqBody.approval_id;
      expect(typeof firstApprovalId).toBe("string");

      await waitForSseEvent(buyerSse.res, "contact_reveal.requested");
      await waitForSseEvent(sellerSse.res, "contact_reveal.requested");

      const denyRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/deny-contact-reveal`, {
        headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID, "Idempotency-Key": randomId() },
        data: { reason: "policy", notes: "ok" }
      });
      await expectStatus(denyRes, 200);
      const denyBody = await denyRes.json();
      expect(denyBody.tx_id).toBe(txId);
      expect(denyBody.contact_reveal_state).toBe("DENIED");

      const buyerDenied = await waitForSseEvent(buyerSse.res, "contact_reveal.denied");
      const sellerDenied = await waitForSseEvent(sellerSse.res, "contact_reveal.denied");
      for (const ev of [buyerDenied, sellerDenied]) {
        expect(ev.type).toBe("contact_reveal.denied");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.approval_id).toBe(firstApprovalId);
        expect(ev.payload?.contact_reveal_state).toBe("DENIED");
      }

      const denyAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "contact_reveal.denied" &&
          row.payload?.tx_id === txId &&
          row.payload?.approval_id === firstApprovalId,
        40
      );
      expect(denyAudit).toBeTruthy();

      const secondReq = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/request-contact-reveal`, {
        headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(secondReq, 202);
      const secondReqBody = await secondReq.json();
      const secondApprovalId = secondReqBody.approval_id;
      expect(typeof secondApprovalId).toBe("string");
      expect(secondApprovalId).toBe(firstApprovalId);

      const buyerRequestedAgain = await waitForSseEvent(buyerSse.res, "contact_reveal.requested");
      const sellerRequestedAgain = await waitForSseEvent(sellerSse.res, "contact_reveal.requested");
      for (const ev of [buyerRequestedAgain, sellerRequestedAgain]) {
        expect(ev.type).toBe("contact_reveal.requested");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.approval_id).toBe(secondApprovalId);
        expect(ev.payload?.contact_reveal_state).toBe("REQUESTED");
      }

      const approveRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/approve-contact-reveal`, {
        headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(approveRes, 200);
      const approveBody = await approveRes.json();
      expect(approveBody.tx_id).toBe(txId);
      expect(approveBody.contact_reveal_state).toBe("APPROVED");
      expect(approveBody.status).toBe("CONTACT_REVEALED");

      const buyerApproved = await waitForSseEvent(buyerSse.res, "contact_reveal.approved");
      const sellerApproved = await waitForSseEvent(sellerSse.res, "contact_reveal.approved");
      for (const ev of [buyerApproved, sellerApproved]) {
        expect(ev.type).toBe("contact_reveal.approved");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.approval_id).toBe(secondApprovalId);
        expect(ev.payload?.contact_reveal_state).toBe("APPROVED");
      }

      const approveAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "contact_reveal.approved" &&
          row.payload?.tx_id === txId &&
          row.payload?.approval_id === secondApprovalId,
        40
      );
      expect(approveAudit).toBeTruthy();
    } finally {
      buyerSse.controller.abort();
      sellerSse.controller.abort();
    }
  });
});
