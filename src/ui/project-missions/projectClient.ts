import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import type { ProjectBrief, ProjectPlan } from "../../shared/project-missions";

export type ProjectMission = {
  id: string; owner_id: string; agent_id: string; version: number;
  brief: ProjectBrief; plan: ProjectPlan; selected_configuration_id: string | null;
  confirmed_version: number | null; confirmed_at: string | null;
  status: "DRAFT" | "SELECTED" | "CONFIRMED" | "CONTACTED";
  contacts: Array<{ seller_agent_id: string; version: number; thread_id: string; message_id: string; sent_at: string }>;
  created_at: string; updated_at: string;
};

export class ProjectRequestError extends Error {
  constructor(public status: number, public code: string, public mission?: ProjectMission) { super(code); }
}

export async function projectRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(`/api/v1/owner/project-missions${path}`, {
    credentials: "include", cache: "no-store", ...init,
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ProjectRequestError(response.status, body?.error?.code || "REQUEST_FAILED", body?.error?.details?.mission);
  if (!body || typeof body !== "object") throw new ProjectRequestError(502, "SERVER_CONTRACT_ERROR");
  return body as T;
}

export function useProjectResource<T>(path: string | null) {
  const router = useRouter();
  const gate = useOwnerSessionGate();
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const key = JSON.stringify([path, gate, router.asPath, revision]);
  const next = router.asPath;
  const locale = router.locale;
  const replace = router.replace;
  useEffect(() => {
    if (path === null || gate === "pending") return;
    const controller = new AbortController();
    const login = () => {
      const prefix = locale && locale !== "en" ? `/${locale}` : "";
      const destination = next.startsWith(`${prefix}/my/`) ? next : `${prefix}${next}`;
      void replace(`${prefix}/auth/login?next=${encodeURIComponent(destination)}`, undefined, { locale: false });
    };
    if (gate === "anonymous") { login(); return; }
    void projectRequest<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ key, data, error: null });
    }).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ProjectRequestError && cause.status === 401) login();
      else setResult({ key, data: null, error: cause instanceof ProjectRequestError ? cause.code : "NETWORK_ERROR" });
    });
    return () => controller.abort();
  }, [path, gate, next, locale, key, replace]);
  const current = result?.key === key ? result : null;
  const update = (data: T) => setResult({ key, data, error: null });
  return { data: current?.data || null, loading: !current, error: current?.error || null, reload, update };
}

export async function assertProjectOwner(ownerId: string) {
  const session = await probeOwnerSession({ fresh: true });
  if (session.state !== "authenticated" || session.ownerId !== ownerId) {
    throw new ProjectRequestError(403, "OWNER_SESSION_CHANGED");
  }
}

export function mutationHeaders(ownerId: string, key: string) {
  return { "Content-Type": "application/json", "Idempotency-Key": key, "X-Expected-Owner-Id": ownerId };
}
