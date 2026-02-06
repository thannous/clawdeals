import { getSupabaseServiceClient } from "../db/supabase";
import { getAuditLogger } from "../audit/singleton";

const DEFAULT_BATCH_SIZE = 500;
const AUDIT_PATH = "/internal/cron/deals-lifecycle";

export function buildStateChanges(updatedRows, previousStatusById, nextStatus, nowIso, timestampField) {
  if (!Array.isArray(updatedRows) || updatedRows.length === 0) return [];
  return updatedRows
    .map((row) => {
      const dealId = row.deal_id || row.dealId || row.id;
      if (!dealId) return null;
      const previousStatus = previousStatusById?.get
        ? previousStatusById.get(dealId) || null
        : previousStatusById?.[dealId] || null;
      const payload = {
        deal_id: dealId,
        previous_status: previousStatus,
        status: nextStatus
      };
      if (timestampField) {
        payload[timestampField] = nowIso;
      }
      return payload;
    })
    .filter(Boolean);
}

async function logStateChanges(changes, nowIso, logger) {
  if (!changes.length) return;
  await Promise.all(
    changes.map((change) =>
      logger({
        occurredAt: nowIso,
        actor: { type: "system", source: "cron" },
        auth: {},
        request: {
          method: "INTERNAL",
          path: AUDIT_PATH
        },
        action: {
          event: "deal.state_changed"
        },
        payload: change,
        outcome: "SUCCESS"
      }).catch((error) => {
        console.error("[deal-lifecycle] audit failed", error);
      })
    )
  );
}

export async function runDealLifecycle({ now = new Date(), batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const client = getSupabaseServiceClient();
  const logger = getAuditLogger();
  const nowIso = now.toISOString();

  let activatedCount = 0;
  let expiredCount = 0;

  // Activate NEW -> ACTIVE
  while (true) {
    const { data: candidates, error } = await client
      .from("deals")
      .select("deal_id, status")
      .eq("status", "NEW")
      .lte("new_until", nowIso)
      .gt("expires_at", nowIso)
      .order("new_until", { ascending: true })
      .limit(batchSize);

    if (error) {
      throw new Error(`Failed to fetch NEW deals: ${error.message}`);
    }
    if (!candidates || candidates.length === 0) {
      break;
    }

    const ids = candidates.map((deal) => deal.deal_id).filter(Boolean);
    const previousStatusById = new Map(candidates.map((deal) => [deal.deal_id, deal.status]));

    const { data: updated, error: updateError } = await client
      .from("deals")
      .update({
        status: "ACTIVE",
        active_at: nowIso,
        updated_at: nowIso
      })
      .in("deal_id", ids)
      .eq("status", "NEW")
      .select("deal_id");

    if (updateError) {
      throw new Error(`Failed to activate deals: ${updateError.message}`);
    }

    const changes = buildStateChanges(updated, previousStatusById, "ACTIVE", nowIso, "active_at");
    await logStateChanges(changes, nowIso, logger);
    activatedCount += changes.length;

    if (candidates.length < batchSize) {
      break;
    }
  }

  // Expire NEW/ACTIVE -> EXPIRED
  while (true) {
    const { data: candidates, error } = await client
      .from("deals")
      .select("deal_id, status")
      .in("status", ["NEW", "ACTIVE"])
      .lte("expires_at", nowIso)
      .order("expires_at", { ascending: true })
      .limit(batchSize);

    if (error) {
      throw new Error(`Failed to fetch expirable deals: ${error.message}`);
    }
    if (!candidates || candidates.length === 0) {
      break;
    }

    const ids = candidates.map((deal) => deal.deal_id).filter(Boolean);
    const previousStatusById = new Map(candidates.map((deal) => [deal.deal_id, deal.status]));

    const { data: updated, error: updateError } = await client
      .from("deals")
      .update({
        status: "EXPIRED",
        expired_at: nowIso,
        updated_at: nowIso
      })
      .in("deal_id", ids)
      .in("status", ["NEW", "ACTIVE"])
      .select("deal_id");

    if (updateError) {
      throw new Error(`Failed to expire deals: ${updateError.message}`);
    }

    const changes = buildStateChanges(updated, previousStatusById, "EXPIRED", nowIso, "expired_at");
    await logStateChanges(changes, nowIso, logger);
    expiredCount += changes.length;

    if (candidates.length < batchSize) {
      break;
    }
  }

  return {
    activated_count: activatedCount,
    expired_count: expiredCount
  };
}
