import { sendJson } from "./response";

export function errorPayload(code: string, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      details: details || undefined
    }
  };
}

export function sendError(
  res: any,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: Record<string, string>
) {
  return sendJson(res, status, errorPayload(code, message, details), headers);
}
