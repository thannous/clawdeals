import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";
import { missionRequest, MissionRequestError } from "./missionClient";

export function useMissionResource<T>(path: string | null) {
  const router = useRouter();
  const gate = useOwnerSessionGate();
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const next = router.asPath;
  const locale = router.locale;
  const key = JSON.stringify([path, gate, next, locale, revision]);
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
    void missionRequest<T>(path, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setResult({ key, data: value, error: null });
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof MissionRequestError && cause.status === 401) login();
      else setResult({ key, data: null, error: cause instanceof MissionRequestError ? cause.code : "NETWORK_ERROR" });
    });
    return () => controller.abort();
  }, [path, gate, next, locale, revision, key, replace]);

  const current = result?.key === key ? result : null;
  return { data: current?.data || null, error: current?.error || null, loading: !current, reload };
}
