import { getSupabaseServiceClient } from "../db/supabase";

type EnqueueInput = {
  agentId: string;
  reason?: string | null;
};

export async function enqueueTrustScoreRecalc({ agentId, reason }: EnqueueInput) {
  if (!agentId || typeof agentId !== "string") {
    throw Object.assign(new Error("agentId is required"), { status: 400, code: "VALIDATION_ERROR" });
  }

  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await client
    .from("trustscore_recalc_queue")
    .upsert(
      {
        agent_id: agentId,
        last_reason: reason || null,
        updated_at: nowIso
      },
      { onConflict: "agent_id" }
    );

  if (error) {
    throw Object.assign(new Error(error.message || "Failed to enqueue trustscore recalc"), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  return { ok: true };
}

