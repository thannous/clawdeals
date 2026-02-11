import { randomId, randomIp } from "./ids";
import { acceptOffer, createListing, createOffer, expectStatus } from "./http";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb
} from "./supabase";

export async function setupPolicyForOwner(
  request: any,
  ownerId: string,
  overrides: Record<string, unknown> = {}
) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId, "x-forwarded-for": randomIp() },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: [],
      ...overrides
    }
  });
  await expectStatus(policyRes, 200);
}

export async function setVerifiedOwnerContact(
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

export async function createAcceptedTransactionFixture(
  request: any,
  {
    supabase = createSupabaseAdmin(),
    amount = 350,
    currency = "EUR",
    listingTitlePrefix = "Integration listing",
    ageDays = 10,
    setupBuyerPolicy = false
  }: {
    supabase?: any;
    amount?: number;
    currency?: string;
    listingTitlePrefix?: string;
    ageDays?: number;
    setupBuyerPolicy?: boolean;
  } = {}
) {
  const sellerOwnerId = randomId();
  await ensureOwnerDb(supabase, sellerOwnerId);
  await setupPolicyForOwner(request, sellerOwnerId);

  const buyerOwnerId = randomId();
  await ensureOwnerDb(supabase, buyerOwnerId);
  if (setupBuyerPolicy) {
    await setupPolicyForOwner(request, buyerOwnerId);
  }

  const agedCreatedAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
  const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
    createdAt: agedCreatedAt,
    trustScore: 90,
    trustFlags: []
  });
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

  const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
    createdAt: agedCreatedAt,
    trustScore: 90,
    trustFlags: []
  });
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

  const listingRes = await createListing(request, sellerApiKey, {
    title: `${listingTitlePrefix} ${randomId()}`,
    publish: true
  });
  await expectStatus(listingRes, 201);
  const listingBody = await listingRes.json();
  const listingId = listingBody.listing_id;

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const offerRes = await createOffer(
    request,
    buyerApiKey,
    listingId,
    { threadId: null, amount, currency, expiresAt },
    { idempotencyKey: randomId() }
  );
  await expectStatus(offerRes, 201);
  const offerBody = await offerRes.json();
  const offerId = offerBody.offer_id;
  const threadId = offerBody.thread_id;

  const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
  await expectStatus(acceptRes, 200);
  const acceptBody = await acceptRes.json();
  const txId = acceptBody.transaction?.tx_id;

  return {
    supabase,
    sellerOwnerId,
    buyerOwnerId,
    sellerAgent,
    buyerAgent,
    sellerApiKey,
    buyerApiKey,
    listingId,
    offerId,
    threadId,
    txId
  };
}
