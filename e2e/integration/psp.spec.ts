import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { configurePsp, expectStatus, postPspWebhook, pspOnboardSeller } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";

import { canonicalJsonStringify } from "../../src/server/utils/canonical-json";
import { hmacSha256 } from "../../src/server/utils/hmac";

assertIntegrationEnv();

function signWebhook(body: any) {
  const secret = process.env.IDEMPOTENCY_SECRET as string;
  const canonicalBody = canonicalJsonStringify(body);
  return hmacSha256(secret, canonicalBody);
}

test.describe.serial("Integration: PSP setup + webhooks (TI-210)", () => {
  test.setTimeout(60000);

  test("configure, reject invalid signature, dedupe replays, apply account.updated", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);

    const configureRes = await configurePsp(
      request,
      OPS_CONSOLE_OWNER_ID,
      { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(configureRes, 200);

    const onboardRes = await pspOnboardSeller(request, sellerOwnerId, { idempotencyKey: randomId() });
    await expectStatus(onboardRes, 200);

    const onboarding = await onboardRes.json();
    expect(onboarding.kyc_status).toBe("PENDING");

    const eventId = `evt_${randomId()}`;
    const externalAccountId = `mock_acct_${sellerOwnerId}`;
    const eventBody = {
      id: eventId,
      type: "account.updated",
      created_at: new Date().toISOString(),
      data: {
        external_account_id: externalAccountId,
        kyc_status: "VERIFIED",
        requirements_due: { fields: [] }
      }
    };

    const invalidRes = await postPspWebhook(request, { signature: "bad", body: eventBody });
    await expectStatus(invalidRes, 401);

    const { data: invalidRows, error: invalidErr } = await supabase
      .from("psp_webhook_events")
      .select("id,psp_event_id")
      .eq("psp_event_id", eventId);
    if (invalidErr) throw invalidErr;
    expect(invalidRows || []).toHaveLength(0);

    const signature = signWebhook(eventBody);
    for (let i = 0; i < 3; i += 1) {
      const res = await postPspWebhook(request, { signature, body: eventBody });
      await expectStatus(res, 200);
    }

    const { data: rows, error: rowsErr } = await supabase
      .from("psp_webhook_events")
      .select("id,psp_provider,psp_event_id,type,status")
      .eq("psp_event_id", eventId);
    if (rowsErr) throw rowsErr;
    expect(rows || []).toHaveLength(1);
    expect(rows?.[0]?.status).toBe("APPLIED");

    const { data: account, error: acctErr } = await supabase
      .from("psp_accounts")
      .select("owner_id,psp_external_account_id,kyc_status")
      .eq("owner_id", sellerOwnerId)
      .maybeSingle();
    if (acctErr) throw acctErr;
    expect(account?.psp_external_account_id).toBe(externalAccountId);
    expect(account?.kyc_status).toBe("VERIFIED");
  });
});

