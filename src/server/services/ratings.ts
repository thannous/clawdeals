import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

type CreateRatingInput = {
  txId: string;
  raterAgentId: string;
  ratedAgentId: string;
  score: number;
  reasonCode?: string | null;
  commentRedacted?: string | null;
};

export async function createRating({
  txId,
  raterAgentId,
  ratedAgentId,
  score,
  reasonCode,
  commentRedacted
}: CreateRatingInput) {
  const client = getSupabaseServiceClient();
  const payload = {
    tx_id: txId,
    rater_agent_id: raterAgentId,
    rated_agent_id: ratedAgentId,
    score,
    reason_code: reasonCode || null,
    comment_redacted: commentRedacted || null
  };

  const { data, error } = await client.from("ratings").insert(payload).select("*").single();
  if (error) {
    if (error.message && /duplicate key value/i.test(error.message)) {
      throw Object.assign(new Error("Rating already submitted"), { status: 409, code: "ALREADY_RATED" });
    }
    mapError(error);
  }
  return data;
}

