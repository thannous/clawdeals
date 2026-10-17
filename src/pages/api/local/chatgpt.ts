import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { errorPayload } from "../../../server/http/errors";
import { requireMissionOwner } from "../../../server/http/owner-missions";
import { readOwnerSessionCookie } from "../../../server/auth/session-cookie";
import { getOwnerBuyMission, listOwnerBuyMissionMatches } from "../../../server/services/owner-buy-missions";
import { isLocalChatGPTRequest, localChatGPT } from "../../../server/services/local-chatgpt";
import { isUuid } from "../../../server/utils/validators";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } }, maxDuration: 120 };

export async function handler(req: any, _res: any, ctx: any) {
  const unauthorized = requireMissionOwner(ctx);
  if (unauthorized) return unauthorized;
  if (!readOwnerSessionCookie(req)) return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner session required"));
  const expected = req.headers["x-expected-owner-id"];
  if (expected !== ctx.ownerId) return jsonResponse(409, errorPayload("OWNER_SESSION_CHANGED", "Owner session changed"));
  if (req.method !== "GET" && req.method !== "POST") return jsonResponse(405, errorPayload("METHOD_NOT_ALLOWED", "Use GET or POST"));
  if (req.method === "POST" && req.headers.origin !== `http://${req.headers.host}`) {
    return jsonResponse(403, errorPayload("INVALID_ORIGIN", "Same-origin request required"));
  }
  try {
    if (req.method === "GET") return jsonResponse(200, await localChatGPT("status", ctx.ownerId), { "Cache-Control": "no-store" });
    const { action, missionId, model, locale } = req.body || {};
    if (!["connect", "analyze", "disconnect"].includes(action)) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid action"));
    if (action === "disconnect") return jsonResponse(200, await localChatGPT(action, ctx.ownerId));
    if (!isUuid(missionId)) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid mission"));
    const mission = await getOwnerBuyMission({ ownerId: ctx.ownerId, missionId });
    if (!mission) return jsonResponse(404, errorPayload("NOT_FOUND", "Mission not found"));
    if (action === "connect") {
      const prefix = locale === "fr" || locale === "es" ? `/${locale}` : "";
      return jsonResponse(200, await localChatGPT(action, ctx.ownerId, {
        returnTo: `http://${req.headers.host}${prefix}/my/missions/${missionId}`
      }));
    }
    if (mission.status !== "ACTIVE") return jsonResponse(409, errorPayload("MISSION_INACTIVE", "Mission is inactive"));
    if (typeof model !== "string" || model.length > 120) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Choose a model"));
    const matches = await listOwnerBuyMissionMatches({ ownerId: ctx.ownerId, missionId, limit: 5 });
    if (!matches.items.length) return jsonResponse(409, errorPayload("NO_MATCHES", "No matching listings to compare"));
    const brief = mission.criteria.mission;
    const result = await localChatGPT(action, ctx.ownerId, {
      model,
      mission: { query: mission.criteria.query, currency: brief.currency, hard_budget_max: brief.hard_budget_max,
        preferred_price_max: brief.preferred_price_max, requirements: brief.requirements,
        location: brief.location.label, radius_km: brief.location.radius_km },
      listings: matches.items.map((listing: any) => ({ listing_id: listing.listing_id, title: listing.title,
        description: listing.description, price: listing.price, condition: listing.condition, market_code: listing.market_code }))
    });
    return jsonResponse(200, result, { "Cache-Control": "no-store" });
  } catch (error: any) {
    const code = /^[A-Za-z0-9_.-]{1,120}$/.test(error.code || "") ? error.code : "CHATGPT_UNAVAILABLE";
    return jsonResponse(error.status || 503, errorPayload(code, code), { "Cache-Control": "no-store" });
  }
}

const read = withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.read" });
const write = withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write" });
export default function localOnly(req: any, res: any) {
  if (!isLocalChatGPTRequest(req)) return res.status(404).json(errorPayload("NOT_FOUND", "Not found"));
  res.setHeader("Cache-Control", "no-store");
  return (req.method === "GET" ? read : write)(req, res);
}
