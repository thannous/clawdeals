import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { clearActiveBuyMission, clearWebMcpActionReceipts } from "../../webmcp/ui-bridge";

export type JudgeCapability = {
  loading: boolean;
  enabled: boolean;
  authorized: boolean;
  error: string | null;
};

export type JudgeResetResult = {
  counts?: Record<string, number>;
  thread?: { thread_id?: string; listing_id?: string } | null;
};

export type JudgeResetState = "idle" | "running" | "done" | "failed";

const INITIAL_CAPABILITY: JudgeCapability = { loading: true, enabled: false, authorized: false, error: null };

/**
 * Shared judge-mode reset logic: probes `/api/v1/sandbox/reset` (404 outside the sandbox host) and
 * runs the deterministic `webmcp_challenge` reset with the stored agent key. Both the hub and the
 * live demo page use it so the judge never has to go back to the hub to start over.
 */
export function useJudgeReset(apiKey: string | null) {
  const t = useTranslations("webmcp");
  const [capability, setCapability] = useState<JudgeCapability>(INITIAL_CAPABILITY);
  const [resetState, setResetState] = useState<JudgeResetState>("idle");
  const [resetResult, setResetResult] = useState<JudgeResetResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCapability(INITIAL_CAPABILITY);
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    fetch("/api/v1/sandbox/reset", { method: "GET", headers, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const payload = await response.json();
        setCapability({
          loading: false,
          enabled: payload?.enabled === true,
          authorized: payload?.authorized === true,
          error: null
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCapability({
          loading: false,
          enabled: false,
          authorized: false,
          error: t("judgeReset.capabilityFailed")
        });
      });

    return () => controller.abort();
  }, [apiKey, t]);

  const resetDemo = useCallback(async () => {
    if (!apiKey || !capability.authorized || resetState === "running") return;
    setResetState("running");
    setResetResult(null);
    try {
      const response = await fetch("/api/v1/sandbox/reset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mode: "webmcp_challenge" })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.code || `HTTP_${response.status}`);
      }
      clearActiveBuyMission();
      clearWebMcpActionReceipts();
      setResetResult(payload);
      setResetState("done");
    } catch {
      setResetState("failed");
    }
  }, [apiKey, capability.authorized, resetState]);

  const resetLabel = capability.loading
    ? t("judgeReset.checkingAccess")
    : resetState === "running"
      ? t("judgeReset.resetting")
      : resetState === "done"
        ? t("judgeReset.again")
        : t("judgeReset.reset")

  const statusText = capability.loading
    ? t("judgeReset.checkingHost")
    : capability.authorized
      ? t("judgeReset.authorized")
      : capability.enabled
        ? t("judgeReset.unauthorized")
        : capability.error
          ? t("judgeReset.unavailableError", { error: capability.error })
          : t("judgeReset.unavailable");

  return { capability, resetState, resetResult, resetDemo, resetLabel, statusText };
}
