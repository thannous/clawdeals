import { getSupabaseServiceClient } from "../db/supabase";
import { getAuditLogger } from "../audit/singleton";
import { publishSseEvent } from "../sse/store";

function uniqueStrings(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value) set.add(value);
  });
  return Array.from(set);
}

export async function runOffersExpiration({ now = new Date(), limit = 100 }: any = {}) {
  const client = getSupabaseServiceClient();
  const logger = getAuditLogger();
  const nowIso = now.toISOString();

  const effectiveLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 100;

  const { data, error } = await client.rpc("offers_expire_v0", { p_limit: effectiveLimit });
  if (error) {
    throw Object.assign(new Error(error.message || "Failed to expire offers"), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  const rows = Array.isArray(data) ? data : [];

  await Promise.all(
    rows.map(async (row: any) => {
      const offerId = row.offer_id;
      const listingId = row.listing_id;
      const threadId = row.thread_id;
      const buyerAgentId = row.buyer_agent_id;
      const sellerAgentId = row.seller_agent_id;

      const audienceIds = uniqueStrings([buyerAgentId, sellerAgentId]);

      await Promise.all(
        audienceIds.map(async (audienceId) => {
          try {
            await publishSseEvent({
              audienceType: "agent",
              audienceId,
              type: "offer.expired",
              actor: { type: "system", id: "cron" },
              entity: { type: "offer", id: offerId },
              payload: { listing_id: listingId, thread_id: threadId, status: row.offer_status || row.status || "EXPIRED" },
              ts: nowIso
            });
          } catch (error) {
            console.info("sse.publish_failed", { type: "offer.expired", error: error?.message || String(error) });
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
            path: "/internal/cron/offers-expiration"
          },
          action: {
            event: "offer.expire"
          },
          payload: {
            offer_id: offerId,
            listing_id: listingId,
            thread_id: threadId,
            buyer_agent_id: buyerAgentId,
            seller_agent_id: sellerAgentId,
            expires_at: row.expires_at || null
          },
          outcome: "SUCCESS"
        });
      } catch (error) {
        console.error("[offers-expiration] audit failed", error);
      }
    })
  );

  return { expired_count: rows.length };
}

