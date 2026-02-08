import { getSupabaseServiceClient } from "../db/supabase";
import { getAuditLogger } from "../audit/singleton";
import { publishSseEvent } from "../sse/store";
import { TRANSACTION_AUTO_CLOSE_DAYS } from "../config/transactions";

function uniqueStrings(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value) set.add(value);
  });
  return Array.from(set);
}

export async function runTransactionsAutoClose({
  now = new Date(),
  limit = 100,
  thresholdDays = TRANSACTION_AUTO_CLOSE_DAYS
}: {
  now?: Date;
  limit?: number;
  thresholdDays?: number;
} = {}) {
  const client = getSupabaseServiceClient();
  const logger = getAuditLogger();
  const nowIso = now.toISOString();

  const effectiveLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 100;
  const effectiveDays = Number.isFinite(thresholdDays) ? Math.max(1, Math.floor(thresholdDays)) : 7;

  const { data, error } = await client.rpc("transactions_auto_complete_stale_v0", {
    p_limit: effectiveLimit,
    p_threshold_days: effectiveDays
  });

  if (error) {
    throw Object.assign(new Error(error.message || "Failed to auto-complete stale transactions"), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  const rows = Array.isArray(data) ? data : [];

  await Promise.all(
    rows.map(async (row: any) => {
      const txId = row.tx_id;
      const listingId = row.listing_id;
      const buyerAgentId = row.buyer_agent_id;
      const sellerAgentId = row.seller_agent_id;

      const audienceIds = uniqueStrings([buyerAgentId, sellerAgentId]);

      await Promise.all(
        audienceIds.map(async (audienceId) => {
          try {
            await publishSseEvent({
              audienceType: "agent",
              audienceId,
              type: "transaction.auto_completed",
              actor: { type: "system", id: "cron" },
              entity: { type: "transaction", id: txId },
              payload: {
                listing_id: listingId,
                status: row.tx_status || row.status || "COMPLETED",
                auto_completed: true
              },
              ts: nowIso
            });
          } catch (error) {
            console.info("sse.publish_failed", { type: "transaction.auto_completed", error: error?.message || String(error) });
          }
        })
      );

      try {
        await logger({
          occurredAt: nowIso,
          actor: { type: "system", source: "cron" },
          auth: {},
          request: {
            method: "INTERNAL",
            path: "/internal/cron/transactions-auto-close"
          },
          action: {
            event: "transaction.auto_completed"
          },
          payload: {
            tx_id: txId,
            listing_id: listingId,
            buyer_agent_id: buyerAgentId,
            seller_agent_id: sellerAgentId,
            buyer_completed_at: row.buyer_completed_at || null,
            seller_completed_at: row.seller_completed_at || null,
            auto_completed: true
          },
          outcome: "SUCCESS"
        });
      } catch (error) {
        console.error("[transactions-auto-close] audit failed", error);
      }
    })
  );

  return { auto_completed_count: rows.length };
}
