import { canonicalJsonStringify } from "../../../src/server/utils/canonical-json";
import { hmacSha256 } from "../../../src/server/utils/hmac";

import { randomId } from "./ids";
import { configurePsp, createEscrow, expectStatus, payEscrow, postPspWebhook } from "./http";
import { createAcceptedTransactionFixture } from "./marketplace";
import { OPS_CONSOLE_OWNER_ID } from "./supabase";

export function signPspWebhook(body: any) {
  const secret = process.env.IDEMPOTENCY_SECRET as string;
  const canonicalBody = canonicalJsonStringify(body);
  return hmacSha256(secret, canonicalBody);
}

export async function setupEscrowOnHold(
  request: any,
  options: {
    amount?: number;
    currency?: string;
    listingTitlePrefix?: string;
    supabase?: any;
  } = {}
) {
  const fixture = await createAcceptedTransactionFixture(request, {
    supabase: options.supabase,
    amount: options.amount ?? 350,
    currency: options.currency ?? "EUR",
    listingTitlePrefix: options.listingTitlePrefix ?? "Escrow hold listing",
    setupBuyerPolicy: true
  });

  const configureRes = await configurePsp(
    request,
    OPS_CONSOLE_OWNER_ID,
    { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
    { idempotencyKey: randomId() }
  );
  await expectStatus(configureRes, 200);

  const createRes = await createEscrow(request, fixture.buyerApiKey, fixture.txId, { idempotencyKey: randomId() });
  await expectStatus(createRes, 201);
  const createBody = await createRes.json();
  const escrowId = createBody.escrow_id;

  const payRes = await payEscrow(request, fixture.buyerApiKey, escrowId, { idempotencyKey: randomId() });
  await expectStatus(payRes, 200);
  const payBody = await payRes.json();
  const paymentId = payBody.psp?.payment_id;

  const paymentWebhook = {
    id: `evt_${randomId()}`,
    type: "payment.succeeded",
    created_at: new Date().toISOString(),
    data: {
      payment_id: paymentId,
      hold_id: `hold_${randomId()}`,
      hold_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    }
  };
  const payHookRes = await postPspWebhook(request, { signature: signPspWebhook(paymentWebhook), body: paymentWebhook });
  await expectStatus(payHookRes, 200);

  const { data: escrowAfterHold, error: holdErr } = await fixture.supabase
    .from("escrows")
    .select("escrow_id,status,psp_payment_id")
    .eq("escrow_id", escrowId)
    .maybeSingle();
  if (holdErr) throw holdErr;
  if (escrowAfterHold?.status !== "HOLD") {
    throw new Error(`Expected HOLD status, got ${String(escrowAfterHold?.status || "null")}`);
  }

  return {
    ...fixture,
    escrowId,
    paymentId,
    createBody
  };
}
