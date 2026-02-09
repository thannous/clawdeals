import { listPendingPspWebhookEventsForEscrow, updatePspWebhookEventStatus } from "./psp-webhook-events";
import { markEscrowHold, markEscrowReleased, markEscrowRefunded } from "./escrows";
import { updatePspAccountByExternalId } from "./psp-accounts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function classifyApplyError(error: any) {
  const code = error?.code || null;
  if (code === "ESCROW_NOT_FOUND") return "PENDING_RETRY";
  if (code === "INVALID_STATE") return "PENDING_RETRY";
  if (code === "ESCROW_FINALIZED") return "APPLIED";
  return "FAILED";
}

export async function retryOnEscrowNotFound<T>(fn: () => Promise<T>, { attempts, delayMs }: { attempts: number; delayMs: number }) {
  let lastError: any = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error?.code !== "ESCROW_NOT_FOUND") {
        throw error;
      }
      if (i < attempts - 1) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

export async function applyWebhookEvent(event: any) {
  if (event.type === "account.updated") {
    const updated = await updatePspAccountByExternalId({
      provider: "mock",
      externalAccountId: event.data.external_account_id,
      kycStatus: event.data.kyc_status,
      requirementsDue: event.data.requirements_due ?? null
    });
    if (!updated) {
      const err: any = new Error("PSP account not found");
      err.code = "PSP_ACCOUNT_NOT_FOUND";
      throw err;
    }
    return { ok: true, escrow: null };
  }

  if (event.type === "payment.succeeded") {
    const escrow = await retryOnEscrowNotFound(
      async () =>
        markEscrowHold({
          paymentId: event.data.payment_id,
          holdId: event.data.hold_id ?? null,
          holdExpiresAt: event.data.hold_expires_at ?? null
        }),
      { attempts: 5, delayMs: 75 }
    );
    return { ok: true, escrow };
  }

  if (event.type === "payout.succeeded") {
    const escrow = await retryOnEscrowNotFound(
      async () =>
        markEscrowReleased({
          payoutId: event.data.payout_id
        }),
      { attempts: 5, delayMs: 75 }
    );
    return { ok: true, escrow };
  }

  if (event.type === "refund.succeeded") {
    const escrow = await retryOnEscrowNotFound(
      async () =>
        markEscrowRefunded({
          refundId: event.data.refund_id
        }),
      { attempts: 5, delayMs: 75 }
    );
    return { ok: true, escrow };
  }

  const err: any = new Error("Unsupported PSP event");
  err.code = "PSP_EVENT_UNSUPPORTED";
  throw err;
}

export async function replayPendingEscrowEvents({ escrowId, adapter }: { escrowId: string; adapter: any }) {
  const pending = await listPendingPspWebhookEventsForEscrow({ escrowId, limit: 25 });
  for (const row of pending) {
    try {
      const event = adapter.parseWebhookEvent(row.payload || {});
      const result = await applyWebhookEvent(event);
      await updatePspWebhookEventStatus({
        id: row.id,
        status: "APPLIED",
        error: null,
        escrowId: result.escrow?.escrow_id || escrowId,
        appliedAt: new Date().toISOString()
      });
    } catch (error) {
      const nextStatus = classifyApplyError(error);
      await updatePspWebhookEventStatus({
        id: row.id,
        status: nextStatus,
        error: error?.message || String(error),
        escrowId
      });
    }
  }
}
