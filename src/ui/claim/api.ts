import type { ClaimMode, ConnectSessionClaimView } from "./types";

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function getErrorMessage(body: any, status: number): string {
  const message =
    body?.error?.message ||
    body?.error?.msg ||
    body?.message ||
    (typeof body?.error === "string" ? body.error : null) ||
    `HTTP ${status}`;
  return String(message || `HTTP ${status}`);
}

export async function fetchClaimSession(claimToken: string) {
  const token = String(claimToken || "").trim();
  if (!token) return { ok: false as const, error: "Missing token" };

  try {
    const resp = await fetch(`/api/v1/connect/claims/${encodeURIComponent(token)}`, { method: "GET" });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: getErrorMessage(body, resp.status) };
    }
    const session = body?.data || null;
    if (!session?.session_id) {
      return { ok: false as const, status: resp.status, error: "Unexpected response: missing session_id" };
    }
    return { ok: true as const, data: session as ConnectSessionClaimView };
  } catch (err: any) {
    return { ok: false as const, error: String(err?.message || "Request failed") };
  }
}

export async function claimSession({
  sessionId,
  claimToken,
  mode,
  agentName,
  attachAgentId
}: {
  sessionId: string;
  claimToken: string;
  mode: ClaimMode;
  agentName?: string;
  attachAgentId?: string;
}) {
  const idempotencyKey = randomIdempotencyKey();
  const body = {
    claim_token: claimToken,
    mode,
    agent_name: agentName,
    attach_agent_id: attachAgentId
  };

  try {
    const resp = await fetch(`/api/console/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: getErrorMessage(data, resp.status) };
    }
    return { ok: true as const, data: data?.data || data };
  } catch (err: any) {
    return { ok: false as const, error: String(err?.message || "Request failed") };
  }
}

export async function denySession({ sessionId, claimToken }: { sessionId: string; claimToken: string }) {
  const idempotencyKey = randomIdempotencyKey();

  try {
    const resp = await fetch(`/api/console/connect/sessions/${encodeURIComponent(sessionId)}/deny`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({ claim_token: claimToken })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: getErrorMessage(data, resp.status) };
    }
    return { ok: true as const, data: data?.data || data };
  } catch (err: any) {
    return { ok: false as const, error: String(err?.message || "Request failed") };
  }
}
