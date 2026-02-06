import { jsonResponse } from "./response";

export function methodNotAllowed(allowed = []) {
  return jsonResponse(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, {
    Allow: allowed.join(", ")
  });
}
