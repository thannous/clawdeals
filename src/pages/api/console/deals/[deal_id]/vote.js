import crypto from "crypto";
import { createDealVote } from "../../../../../server/services/deals";
import { isUuid } from "../../../../../server/utils/validators";

function sanitizeReason(value) {
  const raw = typeof value === "string" ? value : "";
  let reason = raw.trim();
  if (!reason) return "";
  reason = reason.replace(/<[^>]*>/g, "");
  reason = reason.replace(/\bhttps?:\/\/\S+/gi, "[redacted]");
  return reason.trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is allowed" } });
  }

  const dealId = Array.isArray(req.query.deal_id) ? req.query.deal_id[0] : req.query.deal_id;
  if (!isUuid(dealId)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "deal_id must be a UUID" } });
  }

  const { direction, reason } = req.body || {};
  if (direction !== "up" && direction !== "down") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "direction must be up or down" } });
  }

  const cleanedReason = sanitizeReason(reason);
  if (!cleanedReason) {
    return res.status(400).json({ error: { code: "REASON_REQUIRED", message: "reason is required" } });
  }
  if (cleanedReason.length > 240) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "reason must be 1..240 characters" } });
  }

  const agentId = process.env.CONSOLE_OPS_AGENT_ID || "00000000-0000-4000-a000-000000000001";
  const directionValue = direction === "up" ? 1 : -1;

  try {
    const result = await createDealVote({
      dealId,
      agentId,
      direction: directionValue,
      reason: cleanedReason,
      weight: 1.0
    });

    const vote = {
      deal_id: result.deal_id,
      agent_id: result.agent_id,
      direction: result.direction,
      reason: result.reason,
      weight: toNumber(result.weight),
      created_at: result.created_at
    };

    const deal = {
      deal_id: result.deal_id,
      status: result.status,
      temperature: result.status === "NEW" ? null : result.temperature,
      votes_up: result.votes_up,
      votes_down: result.votes_down
    };

    return res.status(201).json({ vote, deal });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: { code: error.code || "ERROR", message: error.message } });
  }
}
