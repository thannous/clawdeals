import { createElement, type ReactElement } from "react";

export const WEBMCP_ORIGIN_TRIAL_ENV = "NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN";

export function getWebMcpOriginTrialToken(
  env: Record<string, string | undefined> = process.env
): string | null {
  const token = String(env[WEBMCP_ORIGIN_TRIAL_ENV] ?? "").trim();
  return token || null;
}

export function getWebMcpOriginTrialMeta(
  env: Record<string, string | undefined> = process.env
): ReactElement | null {
  const token = getWebMcpOriginTrialToken(env);
  if (!token) return null;
  return createElement("meta", { httpEquiv: "origin-trial", content: token });
}
