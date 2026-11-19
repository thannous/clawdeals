import { getAuditLogger } from "../audit/singleton";
import { INSPECTION_AUTO_RELEASE_BATCH } from "../config/protected-checkout";
import { createPspAdapter } from "../psp";
import { publishSseEvent } from "../sse/store";
import { setEscrowReleasePending } from "./escrows";
import { claimInspectionExpiredEscrows } from "./protected-checkout";
import { getPspConfig } from "./psp-config";
import { claimOrphanedPspWebhookEvents } from "./psp-webhook-events";
import { replayPendingEscrowEvents } from "./psp-webhook-replay";

const CRON_PATH = "/internal/cron/escrow-inspection-release";

async function auditRelease(row: any, nowIso: string, outcome: "SUCCESS" | "FAILURE", extra: Record<string, unknown>) {
  try {
    await getAuditLogger()({
      occurredAt: nowIso,
      actor: { type: "system", source: "cron" },
      auth: {},
      request: { method: "INTERNAL", path: CRON_PATH },
      action: { event: "escrow.inspection_expired", entity_type: "escrow", entity_id: row.escrow_id },
      payload: {
        escrow_id: row.escrow_id,
        tx_id: row.tx_id,
        inspection_ends_at: row.inspection_ends_at,
        inspection_expired_at: row.inspection_expired_at,
        ...extra
      },
      outcome
    });
  } catch (error) {
    console.error("[escrow-inspection-release] audit failed", error);
  }
}

// Releases escrows whose inspection window ended with no dispute. An escrow
// whose payout request fails stays CONFIRMED and is claimed again by a later
// run; a disputed escrow is never claimed.
export async function runInspectionAutoRelease({
  now = new Date(),
  limit = INSPECTION_AUTO_RELEASE_BATCH
}: {
  now?: Date;
  limit?: number;
} = {}) {
  const config = await getPspConfig();
  if (!config) {
    return { claimed_count: 0, released_count: 0, failed_count: 0, skipped: "PSP_NOT_CONFIGURED" };
  }
  const adapter = createPspAdapter({ provider: config.provider as any, mode: config.mode as any });

  const effectiveLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : INSPECTION_AUTO_RELEASE_BATCH;
  const rows = await claimInspectionExpiredEscrows({ limit: effectiveLimit });
  const nowIso = now.toISOString();

  let released = 0;
  let failed = 0;

  for (const row of rows as any[]) {
    try {
      if (!row.psp_payment_id) {
        throw new Error("Escrow payment not initialized");
      }

      const release = await adapter.release({
        escrowId: row.escrow_id,
        paymentId: String(row.psp_payment_id),
        amountMinor: row.amount_gross_minor,
        currency: row.currency
      });
      const pending = await setEscrowReleasePending({ escrowId: row.escrow_id, payoutId: release.payoutId });

      try {
        const claimed = await claimOrphanedPspWebhookEvents({ escrowId: row.escrow_id, payoutId: release.payoutId });
        if (claimed > 0) {
          await replayPendingEscrowEvents({ escrowId: row.escrow_id, adapter });
        }
      } catch (replayError: any) {
        console.info("escrow.inspection_release.replay_failed", {
          escrowId: row.escrow_id,
          error: replayError?.message || String(replayError)
        });
      }

      await Promise.all(
        [row.buyer_agent_id, row.seller_agent_id].filter(Boolean).map(async (audienceId: string) => {
          try {
            await publishSseEvent({
              audienceType: "agent",
              audienceId,
              type: "escrow.state_changed",
              actor: { type: "system", id: "cron" },
              entity: { type: "escrow", id: row.escrow_id },
              payload: { status: pending.status, transition: "inspection_expired" },
              ts: nowIso
            });
          } catch (error: any) {
            console.info("sse.publish_failed", { type: "escrow.state_changed", error: error?.message || String(error) });
          }
        })
      );

      await auditRelease(row, nowIso, "SUCCESS", { psp_payout_id: release.payoutId });
      released += 1;
    } catch (error: any) {
      failed += 1;
      console.error("[escrow-inspection-release] release failed", { escrowId: row.escrow_id, error: error?.message || String(error) });
      await auditRelease(row, nowIso, "FAILURE", { error: error?.message || String(error) });
    }
  }

  return { claimed_count: rows.length, released_count: released, failed_count: failed };
}
