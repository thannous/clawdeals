import type { DeviceAuthorizationView, DeviceMode } from "./types";

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

export async function fetchDeviceRequest(userCode: string) {
  const code = String(userCode || "").trim();
  if (!code) return { ok: false as const, error: "Missing user code" };

  try {
    const resp = await fetch(`/api/oauth/device/requests?user_code=${encodeURIComponent(code)}`, { method: "GET" });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, error: getErrorMessage(body, resp.status) };
    }
    const data = body?.data || null;
    if (!data?.authorization_id) {
      return { ok: false as const, status: resp.status, error: "Unexpected response: missing authorization_id" };
    }
    return { ok: true as const, data: data as DeviceAuthorizationView };
  } catch (err: any) {
    return { ok: false as const, error: String(err?.message || "Request failed") };
  }
}

export async function approveDevice({
  userCode,
  mode,
  agentName,
  attachAgentId
}: {
  userCode: string;
  mode: DeviceMode;
  agentName?: string;
  attachAgentId?: string;
}) {
  const idempotencyKey = randomIdempotencyKey();
  const body = {
    user_code: userCode,
    mode,
    agent_name: agentName,
    attach_agent_id: attachAgentId
  };

  try {
    const resp = await fetch("/api/console/oauth/device/approve", {
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

export async function denyDevice({ userCode }: { userCode: string }) {
  const idempotencyKey = randomIdempotencyKey();
  const body = { user_code: userCode };

  try {
    const resp = await fetch("/api/console/oauth/device/deny", {
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

