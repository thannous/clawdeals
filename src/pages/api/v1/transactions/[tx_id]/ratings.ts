import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getTransaction } from "../../../../../server/services/transactions";
import { createRating } from "../../../../../server/services/ratings";
import { redactMessageText } from "../../../../../server/messaging/redaction";
import { publishSseEvent } from "../../../../../server/sse/store";
import { enqueueTrustScoreRecalc } from "../../../../../server/trustscore/queue";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeReasonCode(value: any) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCommentRedacted(value: string) {
  // Handle markdown-link redaction patterns like "[https://..](<https://..>)" => "[[redacted]".
  return value.replace(/\[\[redacted\]/g, "[redacted]");
}

const ALLOWED_REASON_CODES = new Set([
  "AS_DESCRIBED",
  "FAST_RESPONSE",
  "FRIENDLY",
  "SMOOTH_TRANSACTION",
  "NOT_AS_DESCRIBED",
  "SLOW_RESPONSE",
  "POOR_COMMUNICATION",
  "NO_SHOW"
]);

function isParty(tx: any, agentId: string) {
  return tx?.buyer_agent_id === agentId || tx?.seller_agent_id === agentId;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  // Ensure request-level audit never stores plaintext comment.
  if (ctx) {
    const rawComment = req.body?.comment;
    ctx.body = {
      tx_id: resolveParam(req.query?.tx_id) || null,
      score: req.body?.score ?? null,
      reason_code: req.body?.reason_code ?? null,
      comment_len: typeof rawComment === "string" ? rawComment.length : null
    };
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const agentId = ctx?.agentId || null;
  if (!agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const txId = resolveParam(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }

  const { score, reason_code: reasonCodeRaw, comment: commentRaw } = req.body || {};

  const scoreNum = typeof score === "number" ? score : Number(score);
  if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5) {
    return jsonResponse(400, errorPayload("INVALID_SCORE", "Score must be between 1 and 5"));
  }

  const reasonCode = normalizeReasonCode(reasonCodeRaw);
  if (reasonCode && !ALLOWED_REASON_CODES.has(reasonCode)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason_code is invalid"));
  }

  let redaction: any = null;
  let commentRedacted: string | null = null;
  if (commentRaw !== undefined && commentRaw !== null) {
    if (typeof commentRaw !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "comment must be a string"));
    }
    if (commentRaw.length > 280) {
      return jsonResponse(
        400,
        errorPayload("COMMENT_TOO_LONG", "Comment exceeds 280 characters", {
          length: commentRaw.length,
          max_length: 280
        })
      );
    }

    if (commentRaw.trim().length > 0) {
      redaction = redactMessageText(commentRaw);
      commentRedacted = normalizeCommentRedacted(redaction.text);
    }
  }

  if (ctx) {
    ctx.body = {
      tx_id: String(txId),
      score: scoreNum,
      reason_code: reasonCode,
      comment_len: typeof commentRaw === "string" ? commentRaw.length : null,
      comment_redacted: commentRedacted,
      redaction_applied: Boolean(redaction?.redacted),
      redaction_reasons: redaction?.reasons || []
    };
  }

  try {
    const tx = await getTransaction(String(txId));
    if (!tx) {
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (!isParty(tx, agentId)) {
      // Anti-enumeration.
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (tx.status !== "COMPLETED") {
      return jsonResponse(409, errorPayload("TX_NOT_COMPLETED", "Transaction not in COMPLETED status"));
    }

    const ratedAgentId = tx.buyer_agent_id === agentId ? tx.seller_agent_id : tx.seller_agent_id === agentId ? tx.buyer_agent_id : null;
    if (!ratedAgentId || ratedAgentId === agentId) {
      return jsonResponse(400, errorPayload("CANNOT_RATE_SELF", "Rater cannot rate themselves"));
    }

    const rating = await createRating({
      txId: String(txId),
      raterAgentId: agentId,
      ratedAgentId,
      score: scoreNum,
      reasonCode,
      commentRedacted
    });

    if (ctx) {
      ctx.auditEvent = "rating.created";
      ctx.auditEntityType = "rating";
      ctx.auditEntityId = rating.rating_id;
      ctx.body = {
        rating_id: rating.rating_id,
        tx_id: rating.tx_id,
        rater_agent_id: rating.rater_agent_id,
        rated_agent_id: rating.rated_agent_id,
        score: rating.score,
        reason_code: rating.reason_code || null,
        comment_redacted: rating.comment_redacted || null,
        created_at: rating.created_at
      };
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: agentId,
        type: "rating.created",
        actor: { type: "agent", id: agentId },
        entity: { type: "rating", id: rating.rating_id },
        payload: {
          tx_id: String(txId),
          rated_agent_id: ratedAgentId,
          score: scoreNum
        }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "rating.created", error: error?.message || String(error) });
    }

    try {
      await enqueueTrustScoreRecalc({ agentId: ratedAgentId, reason: "rating.created" });
    } catch (error) {
      console.info("trustscore.enqueue_failed", { error: error?.message || String(error) });
    }

    return jsonResponse(201, {
      rating_id: rating.rating_id,
      tx_id: rating.tx_id,
      rater_agent_id: rating.rater_agent_id,
      rated_agent_id: rating.rated_agent_id,
      score: rating.score,
      reason_code: rating.reason_code || null,
      comment_redacted: rating.comment_redacted || null,
      created_at: rating.created_at
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "ratings.create" });

