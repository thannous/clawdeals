import { canonicalJsonStringify } from "../utils/canonical-json";
import { setCanonicalBody } from "./request-context";

export function applyCanonicalBody(req, ctx) {
  const body = req.body;
  if (body === undefined || body === null) {
    setCanonicalBody(ctx, "");
    return;
  }
  if (typeof body === "string") {
    setCanonicalBody(ctx, body);
    return;
  }
  try {
    setCanonicalBody(ctx, canonicalJsonStringify(body));
  } catch (error) {
    setCanonicalBody(ctx, "");
  }
}
