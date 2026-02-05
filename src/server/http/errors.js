import { sendJson } from "./response";

export function errorPayload(code, message, details) {
  return {
    error: {
      code,
      message,
      details: details || undefined
    }
  };
}

export function sendError(res, status, code, message, details, headers) {
  return sendJson(res, status, errorPayload(code, message, details), headers);
}
