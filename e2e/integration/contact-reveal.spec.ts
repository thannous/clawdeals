import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

import { assertIntegrationEnv, getApiBaseUrl } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { acceptOffer, createListing, createOffer, expectStatus } from "./helpers/http";
import { waitForAuditLogMatching } from "./helpers/audit";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb,
  ensureOpsConsoleAgent,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";

assertIntegrationEnv();

const AGED_CREATED_AT = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

async function loginOwner(api: APIRequestContext, email: string) {
  const start = await api.post("/api/v1/auth/login:start", { data: { email } });
  await expectStatus(start, 201);
  const started = await start.json();
  const confirm = await api.post("/api/v1/auth/login:confirm", {
    data: {
      session_id: started.data.session_id,
      token: started.data.session_token
    }
  });
  await expectStatus(confirm, 200);
  return started.data.owner_id as string;
}

async function setupPolicy(request: APIRequestContext, ownerId: string) {
  const response = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 2000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 2000, contact_reveal: "always" },
      auto_approve: {
        message_types: [],
        actions: ["listing.create", "thread.create", "offer.accept"]
      },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(response, 200);
}

async function setupAcceptedTransaction(request: APIRequestContext) {
  const supabase = createSupabaseAdmin();
  await ensureOpsConsoleAgent(supabase);

  const sellerOwnerId = randomId();
  const buyerOwnerId = randomId();
  const thirdOwnerId = randomId();
  await Promise.all([
    ensureOwnerDb(supabase, sellerOwnerId),
    ensureOwnerDb(supabase, buyerOwnerId),
    ensureOwnerDb(supabase, thirdOwnerId)
  ]);
  await Promise.all([setupPolicy(request, sellerOwnerId), setupPolicy(request, buyerOwnerId)]);

  const sellerEmail = `itest+seller-consent+${sellerOwnerId.slice(0, 8)}@example.com`;
  const buyerEmail = `itest+buyer-consent+${buyerOwnerId.slice(0, 8)}@example.com`;
  const now = new Date().toISOString();
  const updates = [
    supabase
      .from("owners")
      .update({
        email: sellerEmail,
        email_verified_at: now,
        phone_e164: "+33600001234",
        phone_verified_at: now,
        updated_at: now
      })
      .eq("owner_id", sellerOwnerId),
    supabase
      .from("owners")
      .update({
        email: buyerEmail,
        email_verified_at: now,
        phone_e164: "+33612345678",
        phone_verified_at: now,
        updated_at: now
      })
      .eq("owner_id", buyerOwnerId)
  ];
  for (const update of updates) {
    const { error } = await update;
    if (error) throw error;
  }

  const seller = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
    createdAt: AGED_CREATED_AT,
    trustScore: 90,
    trustFlags: []
  });
  const buyer = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
    createdAt: AGED_CREATED_AT,
    trustScore: 90,
    trustFlags: []
  });
  const third = await createAgentDbWithOverrides(supabase, thirdOwnerId, {
    createdAt: AGED_CREATED_AT,
    trustScore: 90,
    trustFlags: []
  });
  const [{ apiKey: sellerApiKey }, { apiKey: buyerApiKey }, { apiKey: thirdApiKey }] = await Promise.all([
    createActiveApiKeyDb(supabase, seller.id),
    createActiveApiKeyDb(supabase, buyer.id),
    createActiveApiKeyDb(supabase, third.id)
  ]);

  const listing = await createListing(request, sellerApiKey, {
    title: `Bilateral contact reveal ${randomId()}`,
    price: { amount: 350, currency: "EUR" },
    publish: true
  });
  await expectStatus(listing, 201);
  const listingId = (await listing.json()).listing_id as string;
  const offer = await createOffer(
    request,
    buyerApiKey,
    listingId,
    {
      amount: 350,
      currency: "EUR",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    },
    { idempotencyKey: randomId() }
  );
  await expectStatus(offer, 201);
  const offerId = (await offer.json()).offer_id as string;
  const accepted = await acceptOffer(request, sellerApiKey, offerId, {
    idempotencyKey: randomId()
  });
  await expectStatus(accepted, 200);
  const txId = (await accepted.json()).transaction?.tx_id as string;
  expect(txId).toBeTruthy();

  return {
    supabase,
    txId,
    sellerOwnerId,
    buyerOwnerId,
    sellerEmail,
    buyerEmail,
    sellerApiKey,
    buyerApiKey,
    thirdApiKey
  };
}

async function loadConsents(supabase: any, txId: string) {
  const { data, error } = await supabase
    .from("approvals")
    .select("approval_id,owner_id,state,action_type,action_ref,action_payload_redacted")
    .eq("action_type", "contact_reveal_consent")
    .eq("action_ref_id", txId)
    .order("owner_id");
  if (error) throw error;
  return data || [];
}

async function resolveConsent(
  ownerContext: APIRequestContext,
  origin: string,
  approvalId: string,
  action: "approve" | "deny" | "revoke"
) {
  return ownerContext.post(`/api/v1/approvals/${approvalId}:${action}`, {
    headers: { Origin: origin, "Idempotency-Key": randomId() },
    data: { note: `integration ${action}` }
  });
}

test.describe.serial("Integration: bilateral contact reveal (TI-370)", () => {
  test.setTimeout(90_000);

  test("buyer then seller: one consent reveals nothing; two reveal counterparty-only", async ({ request }) => {
    const setup = await setupAcceptedTransaction(request);
    const baseURL = getApiBaseUrl();
    const origin = new URL(baseURL).origin;
    const buyerOwner = await playwrightRequest.newContext({ baseURL });
    const sellerOwner = await playwrightRequest.newContext({ baseURL });

    try {
      expect(await loginOwner(buyerOwner, setup.buyerEmail)).toBe(setup.buyerOwnerId);
      expect(await loginOwner(sellerOwner, setup.sellerEmail)).toBe(setup.sellerOwnerId);

      const requested = await request.post(`/api/v1/transactions/${setup.txId}/request-contact-reveal`, {
        headers: {
          Authorization: `Bearer ${setup.buyerApiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
      await expectStatus(requested, 202);
      const requestBody = await requested.json();
      expect(requestBody).toMatchObject({
        tx_id: setup.txId,
        contact_reveal_state: "REQUESTED",
        requester_role: "BUYER",
        consent_states: { buyer: "PENDING", seller: "PENDING" }
      });
      expect(JSON.stringify(requestBody)).not.toMatch(/phone|email/i);

      const consents = await loadConsents(setup.supabase, setup.txId);
      expect(consents).toHaveLength(2);
      expect(new Set(consents.map((row: any) => row.owner_id))).toEqual(
        new Set([setup.buyerOwnerId, setup.sellerOwnerId])
      );
      expect(consents.every((row: any) => row.state === "PENDING")).toBe(true);
      expect(JSON.stringify(consents)).not.toContain(setup.buyerEmail);
      expect(JSON.stringify(consents)).not.toContain(setup.sellerEmail);

      const buyerConsent = consents.find((row: any) => row.owner_id === setup.buyerOwnerId);
      const sellerConsent = consents.find((row: any) => row.owner_id === setup.sellerOwnerId);
      expect(requestBody.approval_id).toBe(buyerConsent.approval_id);

      const opsCannotApprove = await request.post(`/api/v1/transactions/${setup.txId}/approve-contact-reveal`, {
        headers: {
          "x-owner-id": OPS_CONSOLE_OWNER_ID,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
      await expectStatus(opsCannotApprove, 409);
      expect((await opsCannotApprove.json()).error.code).toBe("BILATERAL_CONSENT_REQUIRED");

      const first = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "approve");
      await expectStatus(first, 200);
      expect(await first.json()).toMatchObject({
        data: {
          state: "APPROVED",
          contact_reveal_state: "REQUESTED",
          became_revealed: false
        }
      });

      const afterOne = await request.get(`/api/v1/transactions/${setup.txId}`, {
        headers: { Authorization: `Bearer ${setup.buyerApiKey}` }
      });
      await expectStatus(afterOne, 200);
      const afterOneBody = await afterOne.json();
      expect(afterOneBody.data.contact_reveal_state).toBe("REQUESTED");
      expect(afterOneBody.data).not.toHaveProperty("buyer_contact");
      expect(afterOneBody.data).not.toHaveProperty("seller_contact");
      expect(JSON.stringify(afterOneBody)).not.toContain(setup.sellerEmail);

      const replay = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "approve");
      await expectStatus(replay, 200);
      expect((await replay.json()).data.contact_reveal_state).toBe("REQUESTED");
      expect(await loadConsents(setup.supabase, setup.txId)).toHaveLength(2);

      const second = await resolveConsent(sellerOwner, origin, sellerConsent.approval_id, "approve");
      await expectStatus(second, 200);
      expect(await second.json()).toMatchObject({
        data: {
          state: "APPROVED",
          contact_reveal_state: "APPROVED",
          became_revealed: true
        }
      });

      const buyerView = await request.get(`/api/v1/transactions/${setup.txId}`, {
        headers: { Authorization: `Bearer ${setup.buyerApiKey}` }
      });
      const sellerView = await request.get(`/api/v1/transactions/${setup.txId}`, {
        headers: { Authorization: `Bearer ${setup.sellerApiKey}` }
      });
      await expectStatus(buyerView, 200);
      await expectStatus(sellerView, 200);
      const buyerBody = await buyerView.json();
      const sellerBody = await sellerView.json();
      expect(buyerBody.data.seller_contact.email).toBe(setup.sellerEmail);
      expect(buyerBody.data.buyer_contact.email).toBeUndefined();
      expect(JSON.stringify(buyerBody)).not.toContain(setup.buyerEmail);
      expect(sellerBody.data.buyer_contact.email).toBe(setup.buyerEmail);
      expect(sellerBody.data.seller_contact.email).toBeUndefined();
      expect(JSON.stringify(sellerBody)).not.toContain(setup.sellerEmail);

      const thirdParty = await request.get(`/api/v1/transactions/${setup.txId}`, {
        headers: { Authorization: `Bearer ${setup.thirdApiKey}` }
      });
      await expectStatus(thirdParty, 404);

      const opsMasked = await request.post(`/api/v1/transactions/${setup.txId}/approve-contact-reveal`, {
        headers: {
          "x-owner-id": OPS_CONSOLE_OWNER_ID,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
      await expectStatus(opsMasked, 200);
      const opsBody = await opsMasked.json();
      expect(JSON.stringify(opsBody)).not.toContain(setup.buyerEmail);
      expect(JSON.stringify(opsBody)).not.toContain(setup.sellerEmail);
      expect(opsBody.buyer_contact.email).toBeUndefined();
      expect(opsBody.seller_contact.email).toBeUndefined();

      const finalAudit = await waitForAuditLogMatching(
        setup.supabase,
        (row) =>
          row.action?.event === "contact_reveal.consent_approved" &&
          row.payload?.tx_id === setup.txId &&
          row.payload?.contact_reveal_state === "APPROVED",
        30
      );
      expect(finalAudit).toBeTruthy();
      expect(JSON.stringify(finalAudit)).not.toContain(setup.buyerEmail);
      expect(JSON.stringify(finalAudit)).not.toContain(setup.sellerEmail);
    } finally {
      await buyerOwner.dispose();
      await sellerOwner.dispose();
    }
  });

  test("seller first, denial, retry, and pre-final revocation remain idempotent", async ({ request }) => {
    const setup = await setupAcceptedTransaction(request);
    const baseURL = getApiBaseUrl();
    const origin = new URL(baseURL).origin;
    const buyerOwner = await playwrightRequest.newContext({ baseURL });
    const sellerOwner = await playwrightRequest.newContext({ baseURL });

    try {
      await loginOwner(buyerOwner, setup.buyerEmail);
      await loginOwner(sellerOwner, setup.sellerEmail);

      const requested = await request.post(`/api/v1/transactions/${setup.txId}/request-contact-reveal`, {
        headers: {
          Authorization: `Bearer ${setup.sellerApiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
      await expectStatus(requested, 202);
      expect(await requested.json()).toMatchObject({
        requester_role: "SELLER"
      });
      let consents = await loadConsents(setup.supabase, setup.txId);
      const buyerConsent = consents.find((row: any) => row.owner_id === setup.buyerOwnerId);
      const sellerConsent = consents.find((row: any) => row.owner_id === setup.sellerOwnerId);

      const sellerFirst = await resolveConsent(sellerOwner, origin, sellerConsent.approval_id, "approve");
      await expectStatus(sellerFirst, 200);
      expect((await sellerFirst.json()).data.contact_reveal_state).toBe("REQUESTED");

      const denied = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "deny");
      await expectStatus(denied, 200);
      expect(await denied.json()).toMatchObject({
        data: {
          state: "DENIED",
          contact_reveal_state: "DENIED",
          became_revealed: false
        }
      });
      const deniedReplay = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "deny");
      await expectStatus(deniedReplay, 200);

      const deniedView = await request.get(`/api/v1/transactions/${setup.txId}`, {
        headers: { Authorization: `Bearer ${setup.buyerApiKey}` }
      });
      await expectStatus(deniedView, 200);
      expect(JSON.stringify(await deniedView.json())).not.toContain(setup.sellerEmail);

      const retried = await request.post(`/api/v1/transactions/${setup.txId}/request-contact-reveal`, {
        headers: {
          Authorization: `Bearer ${setup.buyerApiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
      await expectStatus(retried, 202);
      consents = await loadConsents(setup.supabase, setup.txId);
      expect(consents).toHaveLength(2);
      expect(consents.every((row: any) => row.state === "PENDING")).toBe(true);
      expect(consents.find((row: any) => row.owner_id === setup.buyerOwnerId).approval_id).toBe(
        buyerConsent.approval_id
      );

      const buyerApproved = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "approve");
      await expectStatus(buyerApproved, 200);
      const revoked = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "revoke");
      await expectStatus(revoked, 200);
      expect(await revoked.json()).toMatchObject({
        data: {
          state: "CANCELLED",
          contact_reveal_state: "DENIED",
          became_revealed: false
        }
      });

      const finalRetry = await request.post(`/api/v1/transactions/${setup.txId}/request-contact-reveal`, {
        headers: {
          Authorization: `Bearer ${setup.sellerApiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
      await expectStatus(finalRetry, 202);
      const sellerAgain = await resolveConsent(sellerOwner, origin, sellerConsent.approval_id, "approve");
      await expectStatus(sellerAgain, 200);
      expect((await sellerAgain.json()).data.contact_reveal_state).toBe("REQUESTED");
      const buyerSecond = await resolveConsent(buyerOwner, origin, buyerConsent.approval_id, "approve");
      await expectStatus(buyerSecond, 200);
      expect(await buyerSecond.json()).toMatchObject({
        data: { contact_reveal_state: "APPROVED", became_revealed: true }
      });
    } finally {
      await buyerOwner.dispose();
      await sellerOwner.dispose();
    }
  });
});
