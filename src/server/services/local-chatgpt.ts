import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function isLocalChatGPTRequest(req: any) {
  return process.env.NODE_ENV === "development" && process.env.CLAWDEALS_CHATGPT_LOCAL === "1" &&
    !process.env.VERCEL && /^127\.0\.0\.1:\d+$/.test(String(req.headers?.host || ""));
}

export async function localChatGPT(action: string, ownerId: string, payload: Record<string, unknown> = {}) {
  const key = await readFile(join(process.cwd(), "test-results/chatgpt-local/private/bridge-key"), "utf8");
  const port = Number(process.env.CLAWDEALS_CHATGPT_LOCAL_PORT || 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("INVALID_LOCAL_PORT");
  const response = await fetch(`http://127.0.0.1:${port}/bridge`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(action === "analyze" ? 110000 : 30000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...payload, action, ownerId })
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error?.code || "CHATGPT_UNAVAILABLE"), {
    code: body.error?.code || "CHATGPT_UNAVAILABLE", status: response.status
  });
  return body;
}
