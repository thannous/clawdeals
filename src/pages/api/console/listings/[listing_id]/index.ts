import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getListing } from "../../../../../server/services/listings";
import { isUuid } from "../../../../../server/utils/validators";
import { redactEmailsAndPhones } from "../../../../../server/utils/free-text-redaction";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "listing.viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const listingId = resolveParam(req.query?.listing_id);
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing_id must be a UUID"));
  }

  try {
    const listing = await getListing(listingId);
    if (!listing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const titleResult =
      typeof listing.title === "string"
        ? redactEmailsAndPhones(listing.title)
        : { text: listing.title, redacted: false, matchCount: 0 };
    const descriptionResult =
      typeof listing.description === "string"
        ? redactEmailsAndPhones(listing.description)
        : { text: listing.description, redacted: false, matchCount: 0 };

    return jsonResponse(200, {
      listing: {
        ...listing,
        title: titleResult.text,
        description: descriptionResult.text,
        title_redacted: titleResult.redacted,
        description_redacted: descriptionResult.redacted
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "listings.read" }));
